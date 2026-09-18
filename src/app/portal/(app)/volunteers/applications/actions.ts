"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRequestOrigin } from "@/lib/request-origin";
import { sendStaffMessage } from "@/lib/notifications/staff-message";
import { recordOutboundMessage } from "@/lib/notifications/outbound-messages";
import {
  explainSkippedSend,
  RECORD_MESSAGE_ERRORS,
  validateRecordMessage,
} from "@/lib/notifications/record-message";
import {
  notifyVolunteerApplicationConfirmation,
  volunteerApplicationConfirmationDedupeKey,
} from "@/lib/notifications/submission-notifications";
import { VOLUNTEER_APPLICATION_CONFIRMATION_KIND } from "@/lib/notifications/kinds";
import {
  resendDedupeSuffix,
  VOLUNTEER_APPLICATION_RECORD_TYPE,
} from "@/lib/outbound-messages";
import {
  VOLUNTEER_APPLICATION_STATUSES,
  type VolunteerApplicationStatus,
} from "./application-types";

const APPLICATIONS_PATH = "/portal/volunteers/applications";

export type VolunteerApplicationActionResult =
  { error: string } | { success: true };

export async function updateVolunteerApplicationStatusAction(
  id: string,
  status: VolunteerApplicationStatus,
): Promise<VolunteerApplicationActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a volunteer application.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "volunteers",
    "manage",
  );
  if (permissionError) return permissionError;

  if (!(VOLUNTEER_APPLICATION_STATUSES as readonly string[]).includes(status)) {
    return { error: "Not a valid status." };
  }

  const { error } = await supabase
    .from("volunteer_applications")
    .update({ status })
    .eq("id", id);

  if (error) {
    return {
      error: "Could not update this application. Please try again.",
    };
  }

  revalidatePath(APPLICATIONS_PATH);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Messaging the applicant (#1204, on #1203's primitive)
// ---------------------------------------------------------------------------

// What names this record, said this queue's way; the rest of what a composer
// can answer is shared (@/lib/notifications/record-message).
const MESSAGE_ERRORS = {
  SIGNED_OUT: "You must be signed in to message an applicant.",
  NOT_FOUND: "This application could not be found.",
  NO_EMAIL:
    "This application has no email address to write to — the applicant's record was cleared or never carried one.",
  FAILED: RECORD_MESSAGE_ERRORS.FAILED,
} as const;

type ApplicantRow = {
  id: string;
  tenant_id: string;
  person_id: string;
  name: string | null;
  email: string | null;
  reference_code: string;
};

const APPLICANT_SELECT =
  "id, tenant_id, person_id, name, email, reference_code";

/**
 * Write to the person who applied.
 *
 * The reviewer's first move is usually a question — about availability, about
 * a role that would fit better, about a background check — and asking it from
 * a personal mailbox left the next reviewer looking at an application with no
 * record of what was asked or answered. This is that question, kept with the
 * application.
 *
 * The recipient is resolved here from the application, never taken from the
 * client, for the reason #1203 gives: an action that accepted an address would
 * be a relay that sends anything to anyone behind `volunteers:manage`.
 *
 * The address is the one on the application rather than the one on the person,
 * falling back the other way only if retention has cleared it: an applicant
 * typed it into the form this record is, and a later edit to their directory
 * entry should not redirect a reply to an application.
 */
export async function sendVolunteerApplicationMessageAction(input: {
  messageId: string;
  applicationId: string;
  subject: string;
  body: string;
}): Promise<VolunteerApplicationActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase, MESSAGE_ERRORS.SIGNED_OUT);
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "volunteers",
    "manage",
  );
  if (permissionError) return permissionError;

  const validated = validateRecordMessage(input);
  if ("error" in validated) return validated;
  const { subject, body } = validated;

  // Read under the caller's own session, so an application in another tenant
  // is not found rather than being mailed.
  const { data, error } = await supabase
    .from("volunteer_applications")
    .select(APPLICANT_SELECT)
    .eq("id", input.applicationId)
    .maybeSingle<ApplicantRow>();

  if (error) return { error: MESSAGE_ERRORS.FAILED };
  if (!data) return { error: MESSAGE_ERRORS.NOT_FOUND };
  const toEmail = data.email?.trim();
  if (!toEmail) return { error: MESSAGE_ERRORS.NO_EMAIL };

  const outcome = await sendStaffMessage(createSupabaseAdminClient(), {
    messageId: input.messageId,
    tenantId: data.tenant_id,
    // Always present: submit_volunteer_application() resolves it through
    // resolve_or_create_person_by_email() before it inserts the application.
    personId: data.person_id,
    toEmail,
    recipientName: (data.name ?? "").trim(),
    module: "volunteers",
    recordType: VOLUNTEER_APPLICATION_RECORD_TYPE,
    recordId: input.applicationId,
    subject,
    body,
    sentBy: userResult.user.id,
    fallbackOrigin: await getRequestOrigin(),
  });

  if (outcome === "skipped") {
    return { error: await explainSkippedSend(supabase) };
  }
  if (outcome === "failed") return { error: MESSAGE_ERRORS.FAILED };

  revalidatePath(APPLICATIONS_PATH);
  return { success: true };
}

/**
 * Send the applicant's confirmation (#1069) again.
 *
 * For the applications taken before it existed, and for the ones where it went
 * to a mailbox the applicant no longer reads — the reference code in it is how
 * they check their own status on the public site, so a lost copy costs them
 * that. It re-renders through the original sender rather than a copy, so a
 * resent receipt says exactly what a fresh one would.
 *
 * Keyed by reference code because that is what the sender looks the
 * application up by, and by the application's id in the history row, because
 * that is what the queue's sheet reads back.
 */
export async function resendVolunteerApplicationConfirmationAction(
  applicationId: string,
): Promise<VolunteerApplicationActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase, MESSAGE_ERRORS.SIGNED_OUT);
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "volunteers",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("volunteer_applications")
    .select(APPLICANT_SELECT)
    .eq("id", applicationId)
    .maybeSingle<ApplicantRow>();

  if (error) return { error: MESSAGE_ERRORS.FAILED };
  if (!data) return { error: MESSAGE_ERRORS.NOT_FOUND };
  // The sender answers `skipped` for a missing address, which would read to
  // the reviewer as "already sent". Say what is actually wrong.
  if (!data.email?.trim()) return { error: MESSAGE_ERRORS.NO_EMAIL };

  const admin = createSupabaseAdminClient();
  const dedupeSuffix = resendDedupeSuffix();
  // An object rather than a `let`: TypeScript narrows a variable a callback
  // assigns to its initial type, and this one is only ever read afterwards.
  const sent: { subject?: string } = {};

  const outcome = await notifyVolunteerApplicationConfirmation(admin, {
    tenantId: data.tenant_id,
    referenceCode: data.reference_code,
    siteUrl: await getRequestOrigin(),
    dedupeSuffix,
    onRendered: (email) => {
      sent.subject = email.subject;
    },
  });

  if (outcome === "skipped") {
    return {
      error: await explainSkippedSend(
        supabase,
        "The confirmation has already been resent in the last minute.",
      ),
    };
  }
  if (outcome === "failed") {
    return { error: "The confirmation could not be resent. Please try again." };
  }

  // The resend joins the history like any other send, so the sheet explains a
  // second copy the applicant may ask about. The body is empty on purpose:
  // the organization wrote this one, and the renderer is where it lives.
  await recordOutboundMessage(admin, {
    messageId: crypto.randomUUID(),
    tenantId: data.tenant_id,
    personId: data.person_id,
    toEmail: data.email.trim(),
    module: "volunteers",
    recordType: VOLUNTEER_APPLICATION_RECORD_TYPE,
    recordId: applicationId,
    subject: sent.subject ?? "Your volunteer application",
    body: "",
    kind: VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
    dedupeKey: volunteerApplicationConfirmationDedupeKey(
      applicationId,
      dedupeSuffix,
    ),
    status: outcome,
    sentBy: userResult.user.id,
  });

  revalidatePath(APPLICATIONS_PATH);
  return { success: true };
}
