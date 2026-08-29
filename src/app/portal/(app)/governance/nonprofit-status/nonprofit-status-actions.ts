"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import {
  parseMilestoneForm,
  type MilestoneStatus,
} from "./nonprofit-status-form";

export type { MilestoneStatus };

export type MilestoneOwner = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type Milestone = {
  id: string;
  description: string;
  phase: string;
  due_date: string | null;
  status: MilestoneStatus;
  notes: string | null;
  owner: MilestoneOwner | null;
};

export type MilestoneActionResult = { error: string } | { success: true };

export async function createMilestoneAction(
  ownerPersonId: string | null,
  formData: FormData,
): Promise<MilestoneActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a milestone.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseMilestoneForm(formData);
  if ("error" in parsed) return parsed;

  const { data: lastMilestone } = await supabase
    .from("nonprofit_status_milestones")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (lastMilestone?.sort_order ?? 0) + 10;

  const { error } = await supabase.from("nonprofit_status_milestones").insert({
    owner_person_id: ownerPersonId,
    sort_order: sortOrder,
    ...parsed.data,
  });

  if (error) {
    return { error: "Could not add this milestone. Please try again." };
  }

  revalidatePath("/portal/governance/nonprofit-status");
  return { success: true };
}

export async function updateMilestoneAction(
  id: string,
  ownerPersonId: string | null,
  formData: FormData,
): Promise<MilestoneActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update this milestone.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseMilestoneForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("nonprofit_status_milestones")
    .update({ owner_person_id: ownerPersonId, ...parsed.data })
    .eq("id", id);

  if (error) {
    return { error: "Could not update this milestone. Please try again." };
  }

  revalidatePath("/portal/governance/nonprofit-status");
  return { success: true };
}

export async function deleteMilestoneAction(
  id: string,
): Promise<MilestoneActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to delete this milestone.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("nonprofit_status_milestones")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: "Could not delete this milestone. Please try again." };
  }

  revalidatePath("/portal/governance/nonprofit-status");
  return { success: true };
}

export async function updateMilestoneStatusAction(
  id: string,
  status: MilestoneStatus,
): Promise<MilestoneActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update this milestone.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("nonprofit_status_milestones")
    .update({ status })
    .eq("id", id);

  if (error) {
    return {
      error: "Could not update this milestone's status. Please try again.",
    };
  }

  revalidatePath("/portal/governance/nonprofit-status");
  return { success: true };
}
