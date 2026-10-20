import type { SupabaseClient } from "@supabase/supabase-js";

/** The earlier event a carried-forward action was written on. */
export type CarriedForwardEvent = {
  id: string;
  name: string;
  starts_at: string;
  timezone: string;
};

/**
 * Open action items from earlier events that share a program with this one
 * (#1578), oldest event first. An event in no program carries nothing forward.
 *
 * Out of `retro-actions.ts` so a meeting agenda pre-filled from its event
 * (#1624) reads the same list the event's Results card shows: that module is
 * `"use server"`, where a helper taking a client would become an action.
 * Generic over the item columns, which each caller selects for itself.
 */
export async function loadCarriedForwardActions<
  Item extends { event_id: string; created_at: string },
>(
  supabase: SupabaseClient,
  eventId: string,
  itemColumns: string,
): Promise<
  { data: (Item & { event: CarriedForwardEvent })[] } | { error: true }
> {
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("starts_at, event_programs(program_id)")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) return { error: true };
  const programIds = (event?.event_programs ?? []).map(
    (link: { program_id: string }) => link.program_id,
  );
  if (!event || programIds.length === 0) return { data: [] };

  const { data: links, error: linksError } = await supabase
    .from("event_programs")
    .select("event:events!inner(id, name, starts_at, timezone)")
    .in("program_id", programIds)
    .lt("event.starts_at", event.starts_at)
    .neq("event_id", eventId);
  if (linksError) return { error: true };

  const earlier = new Map<string, CarriedForwardEvent>();
  for (const link of (links ?? []) as unknown as {
    event: CarriedForwardEvent;
  }[]) {
    earlier.set(link.event.id, link.event);
  }
  if (earlier.size === 0) return { data: [] };

  const { data: items, error: itemsError } = await supabase
    .from("event_retro_items")
    .select(itemColumns)
    .in("event_id", [...earlier.keys()])
    .eq("kind", "action")
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (itemsError) return { error: true };

  return {
    data: ((items ?? []) as unknown as Item[])
      .map((item) => ({ ...item, event: earlier.get(item.event_id)! }))
      .sort(
        (a, b) =>
          a.event.starts_at.localeCompare(b.event.starts_at) ||
          a.created_at.localeCompare(b.created_at),
      ),
  };
}
