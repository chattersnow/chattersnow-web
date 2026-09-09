"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { ARTWORK_BUCKET } from "@/lib/storage/artwork-submissions";
import {
  ARTWORK_SUBMISSION_STATUSES,
  type ArtworkSubmissionStatus,
} from "./submission-types";

export type ArtworkActionResult = { error: string } | { success: true };

async function requireManage(): Promise<
  { supabase: SupabaseClient } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to review artwork.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "artwork_submissions",
    "manage",
  );
  if (permissionError) return permissionError;
  return { supabase };
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

  const userResult = await guard.supabase.auth.getUser();

  const { error } = await guard.supabase
    .from("artwork_submissions")
    .update({
      status,
      review_notes: notes || null,
      // Stamped here rather than by a trigger: set_updated_at already writes
      // updated_at/updated_by on every touch, and these two mean something
      // narrower -- when a person last made a call on the piece.
      reviewed_at: new Date().toISOString(),
      reviewed_by: userResult.data.user?.id ?? null,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update this submission. Please try again." };
  }

  revalidatePath("/portal/artwork");
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

  revalidatePath("/portal/artwork");
  return { success: true };
}
