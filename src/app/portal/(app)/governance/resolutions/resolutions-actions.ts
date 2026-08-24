"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { parseResolutionForm } from "./resolution-form";
import { parseContentForm } from "../meetings/content-form";

export type ResolutionPerson = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type Resolution = {
  id: string;
  meeting_id: string | null;
  motion_text: string;
  mover: ResolutionPerson;
  seconder: ResolutionPerson | null;
  vote_outcome: "pending" | "passed" | "failed" | "tabled";
  effective_date: string | null;
  external_link: string | null;
  body_text: string | null;
};

export type ResolutionActionResult = { error: string } | { success: true };

const RESOLUTION_SELECT =
  "id, meeting_id, motion_text, vote_outcome, effective_date, external_link, body_text, mover:people!mover_person_id(id, name, email, phone), seconder:people!seconder_person_id(id, name, email, phone)";

export async function listResolutionsAction(
  meetingId?: string,
): Promise<{ data: Resolution[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  let query = supabase
    .from("resolutions")
    .select(RESOLUTION_SELECT)
    .order("created_at", { ascending: false });
  if (meetingId) query = query.eq("meeting_id", meetingId);

  const { data, error } = await query;

  if (error) {
    return { error: "Could not load resolutions. Please try again." };
  }
  return { data: (data ?? []) as unknown as Resolution[] };
}

export async function createResolutionAction(
  meetingId: string | null,
  moverPersonId: string,
  seconderPersonId: string | null,
  formData: FormData,
): Promise<ResolutionActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to add a resolution." };
  }
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;
  if (!moverPersonId) {
    return { error: "Select or create a mover for this resolution." };
  }

  const parsed = parseResolutionForm(formData);
  if ("error" in parsed) return parsed;
  const content = parseContentForm(formData);
  if ("error" in content) return content;

  const { error } = await supabase.from("resolutions").insert({
    meeting_id: meetingId,
    mover_person_id: moverPersonId,
    seconder_person_id: seconderPersonId,
    ...parsed.data,
    ...content.data,
  });

  if (error) {
    return { error: "Could not add this resolution. Please try again." };
  }

  revalidatePath("/portal/governance/resolutions");
  revalidatePath("/portal/governance/meetings");
  return { success: true };
}

export async function updateResolutionAction(
  id: string,
  moverPersonId: string,
  seconderPersonId: string | null,
  formData: FormData,
): Promise<ResolutionActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update this resolution." };
  }
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;
  if (!moverPersonId) {
    return { error: "Select or create a mover for this resolution." };
  }

  const parsed = parseResolutionForm(formData);
  if ("error" in parsed) return parsed;
  const content = parseContentForm(formData);
  if ("error" in content) return content;

  const { error } = await supabase
    .from("resolutions")
    .update({
      mover_person_id: moverPersonId,
      seconder_person_id: seconderPersonId,
      ...parsed.data,
      ...content.data,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not update this resolution. Please try again." };
  }

  revalidatePath("/portal/governance/resolutions");
  revalidatePath("/portal/governance/meetings");
  return { success: true };
}

export async function deleteResolutionAction(
  id: string,
): Promise<ResolutionActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to remove this resolution." };
  }
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.from("resolutions").delete().eq("id", id);

  if (error) {
    return { error: "Could not remove this resolution. Please try again." };
  }

  revalidatePath("/portal/governance/resolutions");
  revalidatePath("/portal/governance/meetings");
  return { success: true };
}
