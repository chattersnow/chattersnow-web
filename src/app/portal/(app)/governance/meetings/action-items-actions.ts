"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { parseActionItemForm } from "./action-item-form";

export type ActionItemOwner = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type ActionItem = {
  id: string;
  meeting_id: string;
  description: string;
  due_date: string | null;
  status: "open" | "done";
  owner: ActionItemOwner;
};

export type ActionItemActionResult = { error: string } | { success: true };

export async function listActionItemsAction(
  meetingId: string,
): Promise<{ data: ActionItem[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("governance_meeting_action_items")
    .select(
      "id, meeting_id, description, due_date, status, owner:people!owner_person_id(id, name, preferred_name, email, phone)",
    )
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });

  if (error) {
    return { error: "Could not load action items. Please try again." };
  }
  return { data: (data ?? []) as unknown as ActionItem[] };
}

/**
 * Open action items from meetings before `beforeDate`, for the agenda's
 * "Action Items From Previous Meeting" section. `meetingId` is excluded so a
 * meeting never lists its own not-yet-saved items as carried over.
 */
export async function listCarriedOverActionItemsAction(
  meetingId: string,
  beforeDate: string,
): Promise<{ data: ActionItem[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data: priorMeetings, error: priorMeetingsError } = await supabase
    .from("governance_meetings")
    .select("id")
    .lt("meeting_date", beforeDate)
    .neq("id", meetingId);

  if (priorMeetingsError) {
    return { error: "Could not load action items. Please try again." };
  }

  const priorMeetingIds = (priorMeetings ?? []).map((meeting) => meeting.id);
  if (priorMeetingIds.length === 0) return { data: [] };

  const { data, error } = await supabase
    .from("governance_meeting_action_items")
    .select(
      "id, meeting_id, description, due_date, status, owner:people!owner_person_id(id, name, preferred_name, email, phone)",
    )
    .in("meeting_id", priorMeetingIds)
    .eq("status", "open")
    .order("due_date", { ascending: true });

  if (error) {
    return { error: "Could not load action items. Please try again." };
  }
  return { data: (data ?? []) as unknown as ActionItem[] };
}

export async function createActionItemAction(
  meetingId: string,
  ownerPersonId: string,
  formData: FormData,
): Promise<ActionItemActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add an action item.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;
  if (!ownerPersonId) {
    return { error: "Select or create an owner for this action item." };
  }

  const parsed = parseActionItemForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("governance_meeting_action_items")
    .insert({
      meeting_id: meetingId,
      owner_person_id: ownerPersonId,
      ...parsed.data,
    });

  if (error) {
    return { error: "Could not add this action item. Please try again." };
  }

  revalidatePath("/portal/governance/meetings");
  return { success: true };
}

export async function updateActionItemAction(
  id: string,
  ownerPersonId: string,
  formData: FormData,
): Promise<ActionItemActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update this action item.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;
  if (!ownerPersonId) {
    return { error: "Select or create an owner for this action item." };
  }

  const parsed = parseActionItemForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("governance_meeting_action_items")
    .update({ owner_person_id: ownerPersonId, ...parsed.data })
    .eq("id", id);

  if (error) {
    return { error: "Could not update this action item. Please try again." };
  }

  revalidatePath("/portal/governance/meetings");
  return { success: true };
}

export async function updateActionItemStatusAction(
  id: string,
  status: "open" | "done",
): Promise<ActionItemActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update this action item.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("governance_meeting_action_items")
    .update({ status })
    .eq("id", id);

  if (error) {
    return { error: "Could not update this action item. Please try again." };
  }

  revalidatePath("/portal/governance/meetings");
  return { success: true };
}

export async function deleteActionItemAction(
  id: string,
): Promise<ActionItemActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to remove this action item.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("governance_meeting_action_items")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: "Could not remove this action item. Please try again." };
  }

  revalidatePath("/portal/governance/meetings");
  return { success: true };
}
