"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { parseArtworkCallForm, type ArtworkCallFormData } from "./call-form";

export type ArtworkCallActionResult = { error: string } | { success: true };

const DUPLICATE_EVENT =
  "That event already has a call for artwork. Edit the existing one instead.";

async function requireManage() {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to manage a call for artwork.",
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

function fields(data: ArtworkCallFormData) {
  return {
    is_open: data.isOpen,
    opens_at: data.opensAt,
    closes_at: data.closesAt,
    intro: data.intro,
    rights_note: data.rightsNote,
    max_images: data.maxImages,
  };
}

export async function createArtworkCallAction(
  formData: FormData,
): Promise<ArtworkCallActionResult> {
  const guard = await requireManage();
  if ("error" in guard) return guard;

  const parsed = parseArtworkCallForm(formData);
  if ("error" in parsed) return parsed;
  if (!parsed.data.eventId) return { error: "Choose an event." };

  // submission_code is left to its column default, which calls
  // generate_artwork_submission_code() -- twelve characters from a 31-letter
  // unambiguous alphabet, retried until unused within the tenant.
  const { error } = await guard.supabase.from("event_artwork_calls").insert({
    event_id: parsed.data.eventId,
    ...fields(parsed.data),
  });

  if (error) {
    // 23505 is the one-call-per-event unique, which is a thing the curator can
    // act on rather than a failure.
    if (error.code === "23505") return { error: DUPLICATE_EVENT };
    return { error: "Could not open this call. Please try again." };
  }

  revalidatePath("/portal/artwork/calls");
  return { success: true };
}

export async function updateArtworkCallAction(
  id: string,
  formData: FormData,
): Promise<ArtworkCallActionResult> {
  const guard = await requireManage();
  if ("error" in guard) return guard;

  const parsed = parseArtworkCallForm(formData);
  if ("error" in parsed) return parsed;

  // event_id is deliberately not updatable. Submissions already point at it,
  // and moving a call to another event would silently re-file every piece an
  // artist sent for the first one.
  const { error } = await guard.supabase
    .from("event_artwork_calls")
    .update(fields(parsed.data))
    .eq("id", id);

  if (error) {
    return { error: "Could not update this call. Please try again." };
  }

  revalidatePath("/portal/artwork/calls");
  return { success: true };
}
