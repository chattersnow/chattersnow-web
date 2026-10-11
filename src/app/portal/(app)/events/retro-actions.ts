"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import {
  parseRetroItemForm,
  type RetroArea,
  type RetroKind,
} from "./retro-form";

export type RetroPerson = { id: string; name: string | null };

export type EventRetroItem = {
  id: string;
  event_id: string;
  kind: RetroKind;
  body: string;
  area: RetroArea | null;
  author_id: string | null;
  author_name: string | null;
  owner: RetroPerson | null;
  status: "open" | "done" | null;
  completed_at: string | null;
  created_at: string;
};

/** An open action item from an earlier event in the same program. */
export type CarriedForwardAction = EventRetroItem & {
  event: { id: string; name: string; starts_at: string };
};

export type EventRetro = {
  items: EventRetroItem[];
  /** events:manage, or on this event's staff roster (#1578). */
  canWrite: boolean;
  /** events:manage edits and deletes any item; others only their own. */
  canManage: boolean;
  userId: string;
  /** A submitted report freezes the retro, except for marking actions done. */
  locked: boolean;
  /** Who an action item can be given to: the event's staff roster. */
  owners: RetroPerson[];
};

export type RetroActionResult = { error: string } | { success: true };

const ITEM_COLUMNS =
  "id, event_id, kind, body, area, author_id, author_name, status, completed_at, created_at, owner:people!event_retro_items_owner_in_tenant(id, name)";

const LOCKED_MESSAGE =
  "This event's report has been submitted. Reopen it to change the retro.";

export async function getEventRetroAction(
  eventId: string,
): Promise<{ data: EventRetro } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return userResult;
  const permissions = await getCurrentUserPermissions(supabase);
  if (!hasPermission(permissions, "events", "view")) {
    return { error: "You don't have permission to perform this action." };
  }

  const [items, canWrite, event, staff] = await Promise.all([
    supabase
      .from("event_retro_items")
      .select(ITEM_COLUMNS)
      .eq("event_id", eventId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase.rpc("can_write_event_retro", { p_event_id: eventId }),
    supabase
      .from("events")
      .select("report_status")
      .eq("id", eventId)
      .maybeSingle(),
    supabase
      .from("event_staff")
      .select("person:people!inner(id, name)")
      .eq("event_id", eventId)
      .order("person(name)", { ascending: true, nullsFirst: false }),
  ]);

  if (items.error || canWrite.error || event.error || staff.error) {
    return { error: "Could not load the retro. Please try again." };
  }

  return {
    data: {
      items: (items.data ?? []) as unknown as EventRetroItem[],
      canWrite: canWrite.data === true,
      canManage: hasPermission(permissions, "events", "manage"),
      userId: userResult.user.id,
      locked: event.data?.report_status === "submitted",
      owners: ((staff.data ?? []) as unknown as { person: RetroPerson }[]).map(
        (row) => row.person,
      ),
    },
  };
}

/**
 * Open action items from earlier events that share a program with this one
 * (#1578), oldest event first. An event in no program carries nothing forward.
 */
export async function listCarriedForwardActionsAction(eventId: string): Promise<
  | {
      data: {
        items: CarriedForwardAction[];
        canManage: boolean;
        userId: string;
      };
    }
  | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return userResult;
  const permissions = await getCurrentUserPermissions(supabase);
  if (!hasPermission(permissions, "events", "view")) {
    return { error: "You don't have permission to perform this action." };
  }
  const empty = {
    data: {
      items: [],
      canManage: hasPermission(permissions, "events", "manage"),
      userId: userResult.user.id,
    },
  };
  const failed = { error: "Could not load carried-forward actions." };

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("starts_at, event_programs(program_id)")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) return failed;
  const programIds = (event?.event_programs ?? []).map(
    (link: { program_id: string }) => link.program_id,
  );
  if (!event || programIds.length === 0) return empty;

  const { data: links, error: linksError } = await supabase
    .from("event_programs")
    .select("event:events!inner(id, name, starts_at)")
    .in("program_id", programIds)
    .lt("event.starts_at", event.starts_at)
    .neq("event_id", eventId);
  if (linksError) return failed;

  const earlier = new Map<
    string,
    { id: string; name: string; starts_at: string }
  >();
  for (const link of (links ?? []) as unknown as {
    event: { id: string; name: string; starts_at: string };
  }[]) {
    earlier.set(link.event.id, link.event);
  }
  if (earlier.size === 0) return empty;

  const { data: items, error: itemsError } = await supabase
    .from("event_retro_items")
    .select(ITEM_COLUMNS)
    .in("event_id", [...earlier.keys()])
    .eq("kind", "action")
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (itemsError) return failed;

  const carried = ((items ?? []) as unknown as EventRetroItem[])
    .map((item) => ({ ...item, event: earlier.get(item.event_id)! }))
    .sort(
      (a, b) =>
        a.event.starts_at.localeCompare(b.event.starts_at) ||
        a.created_at.localeCompare(b.created_at),
    );

  return { data: { ...empty.data, items: carried } };
}

async function isReportLocked(supabase: SupabaseClient, eventId: string) {
  const { data } = await supabase
    .from("events")
    .select("report_status")
    .eq("id", eventId)
    .maybeSingle();
  return data?.report_status === "submitted";
}

/**
 * The same rule as the RLS policies, checked here so a refusal reads as a
 * sentence rather than a silent no-op: events:manage may change any item, an
 * author their own while they may still write to the event's retro.
 */
async function checkItemAccess(
  supabase: SupabaseClient,
  id: string,
  userId: string,
): Promise<{ eventId: string } | { error: string }> {
  const { data: item } = await supabase
    .from("event_retro_items")
    .select("event_id, author_id")
    .eq("id", id)
    .maybeSingle();
  if (!item) return { error: "That retro item no longer exists." };

  const permissions = await getCurrentUserPermissions(supabase);
  if (hasPermission(permissions, "events", "manage")) {
    return { eventId: item.event_id };
  }
  if (item.author_id === userId) {
    const { data: canWrite } = await supabase.rpc("can_write_event_retro", {
      p_event_id: item.event_id,
    });
    if (canWrite === true) return { eventId: item.event_id };
  }
  return { error: "Only the item's author or an event manager can change it." };
}

export async function createEventRetroItemAction(
  eventId: string,
  formData: FormData,
): Promise<RetroActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add to the retro.",
  );
  if ("error" in userResult) return userResult;

  const { data: canWrite } = await supabase.rpc("can_write_event_retro", {
    p_event_id: eventId,
  });
  if (canWrite !== true) {
    return {
      error: "Only the event's staff and event managers can add to its retro.",
    };
  }
  if (await isReportLocked(supabase, eventId)) return { error: LOCKED_MESSAGE };

  const parsed = parseRetroItemForm(formData);
  if ("error" in parsed) return parsed;
  const { kind, body, area, ownerPersonId } = parsed.data;

  const { error } = await supabase.from("event_retro_items").insert({
    event_id: eventId,
    kind,
    body,
    area,
    owner_person_id: ownerPersonId,
    status: kind === "action" ? "open" : null,
    author_id: userResult.user.id,
  });
  if (error) return { error: "Could not add the item. Please try again." };

  revalidatePath("/portal/events");
  return { success: true };
}

export async function updateEventRetroItemAction(
  id: string,
  formData: FormData,
): Promise<RetroActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to change the retro.",
  );
  if ("error" in userResult) return userResult;
  const access = await checkItemAccess(supabase, id, userResult.user.id);
  if ("error" in access) return access;
  if (await isReportLocked(supabase, access.eventId)) {
    return { error: LOCKED_MESSAGE };
  }

  const parsed = parseRetroItemForm(formData);
  if ("error" in parsed) return parsed;
  const { kind, body, area, ownerPersonId } = parsed.data;

  const { data: current } = await supabase
    .from("event_retro_items")
    .select("status, completed_at")
    .eq("id", id)
    .maybeSingle();
  // An item that becomes an action starts open; one that stops being an
  // action drops its status, as the table's check constraint requires.
  const status = kind === "action" ? (current?.status ?? "open") : null;
  const { error } = await supabase
    .from("event_retro_items")
    .update({
      kind,
      body,
      area,
      owner_person_id: ownerPersonId,
      status,
      completed_at: status === "done" ? (current?.completed_at ?? null) : null,
    })
    .eq("id", id);
  if (error) return { error: "Could not save the item. Please try again." };

  revalidatePath("/portal/events");
  return { success: true };
}

/**
 * Open or close an action item. Allowed on a submitted report too: carried
 * forward items are closed from later events, long after the first report.
 */
export async function setEventRetroActionDoneAction(
  id: string,
  done: boolean,
): Promise<RetroActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update an action item.",
  );
  if ("error" in userResult) return userResult;
  const access = await checkItemAccess(supabase, id, userResult.user.id);
  if ("error" in access) return access;

  const { error } = await supabase
    .from("event_retro_items")
    .update({
      status: done ? "done" : "open",
      completed_at: done ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("kind", "action");
  if (error) {
    return { error: "Could not update the action item. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function deleteEventRetroItemAction(
  id: string,
): Promise<RetroActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to remove a retro item.",
  );
  if ("error" in userResult) return userResult;
  const access = await checkItemAccess(supabase, id, userResult.user.id);
  if ("error" in access) return access;
  if (await isReportLocked(supabase, access.eventId)) {
    return { error: LOCKED_MESSAGE };
  }

  const { error } = await supabase
    .from("event_retro_items")
    .delete()
    .eq("id", id);
  if (error) return { error: "Could not remove the item. Please try again." };

  revalidatePath("/portal/events");
  return { success: true };
}
