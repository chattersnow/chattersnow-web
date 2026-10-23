"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseChecklistItemForm } from "./checklist-form";
import { checkEventAccess } from "@/lib/auth/event-access";
import { checkUser } from "@/lib/auth/current-user";

export type EventChecklistItem = {
  id: string;
  event_id: string;
  title: string;
  is_done: boolean;
  completed_at: string | null;
  created_at: string;
  owner_person_id: string | null;
  due_date: string | null;
  owner: { id: string; name: string | null } | null;
};

export type ChecklistActionResult = { error: string } | { success: true };

export async function listEventChecklistItemsAction(
  eventId: string,
): Promise<{ data: EventChecklistItem[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkEventAccess(supabase, {
    table: "event_checklist_items",
    level: "view",
    eventId,
  });
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("event_checklist_items")
    .select(
      "id, event_id, title, is_done, completed_at, created_at, owner_person_id, due_date, owner:people!event_checklist_items_owner_in_tenant(id, name)",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    return { error: "Could not load the checklist. Please try again." };
  }
  return { data: (data ?? []) as unknown as EventChecklistItem[] };
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
  const permissionError = await checkEventAccess(supabase, {
    table: "event_checklist_items",
    level: "manage",
    eventId,
  });
  if (permissionError) return permissionError;

  const parsed = parseChecklistItemForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("event_checklist_items")
    .insert({ event_id: eventId, ...parsed.data });

  if (error) {
    // The owner is tenant-checked by a composite foreign key, so a person from
    // another organization fails as a foreign-key violation.
    if (error.code === "23503") {
      return { error: "Pick an owner from this organization's people." };
    }
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
  const permissionError = await checkEventAccess(supabase, {
    table: "event_checklist_items",
    level: "manage",
  });
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
  const permissionError = await checkEventAccess(supabase, {
    table: "event_checklist_items",
    level: "manage",
  });
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
