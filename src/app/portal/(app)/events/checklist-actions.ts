"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseChecklistItemForm } from "./checklist-form";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type EventChecklistItem = {
  id: string;
  event_id: string;
  title: string;
  is_done: boolean;
  completed_at: string | null;
  created_at: string;
};

export type ChecklistActionResult = { error: string } | { success: true };

export async function listEventChecklistItemsAction(
  eventId: string,
): Promise<{ data: EventChecklistItem[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("event_checklist_items")
    .select("id, event_id, title, is_done, completed_at, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    return { error: "Could not load the checklist. Please try again." };
  }
  return { data: (data ?? []) as EventChecklistItem[] };
}

export async function createEventChecklistItemAction(
  eventId: string,
  formData: FormData,
): Promise<ChecklistActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a checklist item.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const parsed = parseChecklistItemForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("event_checklist_items")
    .insert({ event_id: eventId, ...parsed.data });

  if (error) {
    return { error: "Could not add the checklist item. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function toggleEventChecklistItemAction(
  id: string,
  isDone: boolean,
): Promise<ChecklistActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a checklist item.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("event_checklist_items")
    .update({
      is_done: isDone,
      completed_at: isDone ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) {
    return {
      error: "Could not update the checklist item. Please try again.",
    };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function deleteEventChecklistItemAction(
  id: string,
): Promise<ChecklistActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to remove a checklist item.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("event_checklist_items")
    .delete()
    .eq("id", id);
  if (error) {
    return {
      error: "Could not remove the checklist item. Please try again.",
    };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
