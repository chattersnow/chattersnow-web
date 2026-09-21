"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { getRequestOrigin } from "@/lib/request-origin";
import { sendStaffMessage } from "@/lib/notifications/staff-message";
import { recordOutboundMessage } from "@/lib/notifications/outbound-messages";
import {
  explainSkippedSend,
  RECORD_MESSAGE_ERRORS,
  validateRecordMessage,
} from "@/lib/notifications/record-message";
import {
  artworkSubmissionConfirmationDedupeKey,
  sendArtworkSubmissionConfirmation,
} from "@/lib/notifications/submission-notifications";
import { ARTWORK_SUBMISSION_CONFIRMATION_KIND } from "@/lib/notifications/kinds";
import {
  ARTWORK_SUBMISSION_RECORD_TYPE,
  resendDedupeSuffix,
} from "@/lib/outbound-messages";
import { ARTWORK_BUCKET } from "@/lib/storage/artwork-submissions";
import {
  ARTWORK_SUBMISSION_STATUSES,
  type ArtworkSubmissionStatus,
} from "./submission-types";

const ARTWORK_PATH = "/portal/artwork";
/** The has_permission() resource key the message history is read against. */
const ARTWORK_MODULE = "artwork_submissions";

export type ArtworkActionResult = { error: string } | { success: true };

/**
 * The guard every action in this file opens with. It hands back the user as
 * well as the client because three of the four need the actor's id -- stamped
 * on a review, and on the history row of a message whose insert runs on the
 * service-role client, where auth.uid() is null and this column is therefore
 * the only record of who sent it.
 */
async function requireManage(
  signedOutMessage = "You must be signed in to review artwork.",
): Promise<{ supabase: SupabaseClient; user: User } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase, signedOutMessage);
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    ARTWORK_MODULE,
    "manage",
  );
  if (permissionError) return permissionError;
  return { supabase, user: userResult.user };
}

/**
 * Triage, so a guarded update rather than a SECURITY DEFINER RPC -- the same
 * call updateContactMessageStatusAction makes. Nothing here needs actor rules
 * or a state machine: a curator may move a piece between the three states as
 * often as the conversation about it changes.
 */
export async function updateArtworkSubmissionStatusAction(
  id: string,
  status: ArtworkSubmissionStatus,
  reviewNotes: string | null,
): Promise<ArtworkActionResult> {
  const guard = await requireManage();
  if ("error" in guard) return guard;

  if (!(ARTWORK_SUBMISSION_STATUSES as readonly string[]).includes(status)) {
    return { error: "Not a valid status." };
  }
  const notes = (reviewNotes ?? "").trim();
  if (notes.length > 2000) {
    return { error: "Please keep the notes under 2000 characters." };
  }

  const { error } = await guard.supabase
    .from("artwork_submissions")
    .update({
      status,
      review_notes: notes || null,
      // Stamped here rather than by a trigger: set_updated_at already writes
      // updated_at/updated_by on every touch, and these two mean something
      // narrower -- when a person last made a call on the piece.
      reviewed_at: new Date().toISOString(),
      reviewed_by: guard.user.id,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update this submission. Please try again." };
  }

  revalidatePath(ARTWORK_PATH);
  return { success: true };
}

/**
 * Deletes a submission and every object behind it.
 *
 * For material that should not be sitting in the bucket at all -- the reason
 * the storage delete policy exists. The row cascades to
 * artwork_submission_images, so the paths are read first; the daily purge
 * would eventually collect them either way, and a failure here is reported
 * rather than swallowed so a curator knows whether the bytes are gone.
 */
export async function deleteArtworkSubmissionAction(
  id: string,
): Promise<ArtworkActionResult> {
  const guard = await requireManage();
  if ("error" in guard) return guard;

  const { data: images, error: readError } = await guard.supabase
    .from("artwork_submission_images")
    .select("storage_path, thumb_path")
    .eq("submission_id", id);

  if (readError) {
    return { error: "Could not read this submission. Please try again." };
  }

  const paths = (images ?? []).flatMap(
    (image: { storage_path: string; thumb_path: string }) => [
      image.storage_path,
      image.thumb_path,
    ],
  );

  if (paths.length > 0) {
    const { error: removeError } = await guard.supabase.storage
      .from(ARTWORK_BUCKET)
      .remove(paths);
    if (removeError) {
      return { error: "Could not remove the images. Please try again." };
    }
  }

  const { error } = await guard.supabase
    .from("artwork_submissions")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: "Could not delete this submission. Please try again." };
  }

  revalidatePath(ARTWORK_PATH);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Messaging the artist (#1309, on #1203's primitive)
// ---------------------------------------------------------------------------

// What names this record, said this queue's way; the rest of what a composer
// can answer is shared (@/lib/notifications/record-message).
const MESSAGE_ERRORS = {
  SIGNED_OUT: "You must be signed in to message an artist.",
  NOT_FOUND: "This submission could not be found.",
  NO_EMAIL: "This submission has no email address to write to.",
  FAILED: RECORD_MESSAGE_ERRORS.FAILED,
} as const;

type SubmitterRow = {
  tenant_id: string;
  submitter_name: string | null;
  submitter_email: string | null;
};

const SUBMITTER_SELECT = "tenant_id, submitter_name, submitter_email";

/**
 * Write to the artist whose work this is.
 *
 * A curator's answer to a submission is a conversation -- accept it, ask for a
 * higher-resolution file, say no -- and until now it was held in a personal
 * mailbox, so the record of what decided the piece lived nowhere. This is that
 * conversation, kept with the submission.
 *
 * The recipient is resolved here from the submission, never taken from the
 * client, for the reason #1203 gives: an action that accepted an address would
 * be a relay that sends anything to anyone behind `artwork_submissions:manage`.
 *
 * `personId` is null, which is the contact-message case rather than the gear
 * request's: submit_artwork() mints no `people` row, deliberately, and this
 * ticket does not change that. sendStaffMessage() hands the same null to
 * deliverEmail(), so the ledger row and the history row agree.
 *
 * It does not touch `status` or `reviewed_at`. Asking a question is not the
 * same as making a call on the piece, and conflating them would make the queue
 * lie -- the call #1204 made for contact messages.
 */
export async function sendArtworkSubmissionMessageAction(input: {
  messageId: string;
  submissionId: string;
  subject: string;
  body: string;
}): Promise<ArtworkActionResult> {
  const guard = await requireManage(MESSAGE_ERRORS.SIGNED_OUT);
  if ("error" in guard) return guard;

  const validated = validateRecordMessage(input);
  if ("error" in validated) return validated;
  const { subject, body } = validated;

  // Read under the caller's own session, so a submission in another tenant is
  // not found rather than being mailed.
  const { data, error } = await guard.supabase
    .from("artwork_submissions")
    .select(SUBMITTER_SELECT)
    .eq("id", input.submissionId)
    .maybeSingle<SubmitterRow>();

  if (error) return { error: MESSAGE_ERRORS.FAILED };
  if (!data) return { error: MESSAGE_ERRORS.NOT_FOUND };
  const toEmail = data.submitter_email?.trim();
  if (!toEmail) return { error: MESSAGE_ERRORS.NO_EMAIL };

  const outcome = await sendStaffMessage(createSupabaseAdminClient(), {
    messageId: input.messageId,
    tenantId: data.tenant_id,
    personId: null,
    toEmail,
    recipientName: (data.submitter_name ?? "").trim(),
    module: ARTWORK_MODULE,
    recordType: ARTWORK_SUBMISSION_RECORD_TYPE,
    recordId: input.submissionId,
    subject,
    body,
    sentBy: guard.user.id,
    fallbackOrigin: await getRequestOrigin(),
  });

  if (outcome === "skipped") {
    return { error: await explainSkippedSend(guard.supabase) };
  }
  if (outcome === "failed") return { error: MESSAGE_ERRORS.FAILED };

  revalidatePath(ARTWORK_PATH);
  return { success: true };
}

/**
 * Send the artist's acknowledgement (#1237) again.
 *
 * The case that prompted #1309: a submission arrived and nobody in the portal
 * could tell whether the acknowledgement had gone. It re-renders through the
 * original sender rather than a copy, so a resent acknowledgement names the
 * call and counts the images exactly as a fresh one would.
 */
export async function resendArtworkSubmissionConfirmationAction(
  submissionId: string,
): Promise<ArtworkActionResult> {
  const guard = await requireManage(MESSAGE_ERRORS.SIGNED_OUT);
  if ("error" in guard) return guard;

  const { data, error } = await guard.supabase
    .from("artwork_submissions")
    .select(SUBMITTER_SELECT)
    .eq("id", submissionId)
    .maybeSingle<SubmitterRow>();

  if (error) return { error: MESSAGE_ERRORS.FAILED };
  if (!data) return { error: MESSAGE_ERRORS.NOT_FOUND };
  // The sender answers `skipped` for a missing address, which would read to
  // the curator as "already sent". Say what is actually wrong. Only the
  // address half of the gear request's guard applies here: a null person_id is
  // ordinary for this queue, not a fault.
  const toEmail = data.submitter_email?.trim();
  if (!toEmail) return { error: MESSAGE_ERRORS.NO_EMAIL };

  const admin = createSupabaseAdminClient();
  const dedupeSuffix = resendDedupeSuffix();
  // An object rather than two `let`s: TypeScript narrows a variable a callback
  // assigns to its initial type, and these are only ever read afterwards. The
  // person is the sender's to resolve, not this action's -- see the callback's
  // own note on sendArtworkSubmissionConfirmation().
  const sent: { subject?: string; personId: string | null } = {
    personId: null,
  };

  const outcome = await sendArtworkSubmissionConfirmation(admin, {
    submissionId,
    siteUrl: await getRequestOrigin(),
    dedupeSuffix,
    onRendered: (email, resolved) => {
      sent.subject = email.subject;
      sent.personId = resolved.personId;
    },
  });

  if (outcome === "skipped") {
    return {
      error: await explainSkippedSend(
        guard.supabase,
        "The acknowledgement has already been resent in the last minute.",
      ),
    };
  }
  if (outcome === "failed") {
    return {
      error: "The acknowledgement could not be resent. Please try again.",
    };
  }

  // The resend joins the history like any other send, so the sheet explains a
  // second copy the artist may ask about. The body is empty on purpose: the
  // organization wrote this one, and the renderer is where it lives.
  await recordOutboundMessage(admin, {
    messageId: crypto.randomUUID(),
    tenantId: data.tenant_id,
    personId: sent.personId,
    toEmail,
    module: ARTWORK_MODULE,
    recordType: ARTWORK_SUBMISSION_RECORD_TYPE,
    recordId: submissionId,
    subject: sent.subject ?? "Your artwork submission",
    body: "",
    kind: ARTWORK_SUBMISSION_CONFIRMATION_KIND,
    dedupeKey: artworkSubmissionConfirmationDedupeKey(
      submissionId,
      dedupeSuffix,
    ),
    status: outcome,
    sentBy: guard.user.id,
  });

  revalidatePath(ARTWORK_PATH);
  return { success: true };
}
