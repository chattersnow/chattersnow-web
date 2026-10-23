import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The people an event's rows point to, for callers `people select` does not
 * admit -- a per-event guest above all (#1693). `event_people()` returns only
 * those referenced by rows of that event the caller can read, with email and
 * phone only where a card shows them; `people` itself stays role-only.
 */
export type EventPerson = {
  id: string;
  name: string | null;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
};

export async function listEventPeople(
  supabase: SupabaseClient,
  eventId: string,
): Promise<EventPerson[] | null> {
  const { data, error } = await supabase.rpc("event_people", {
    p_event_id: eventId,
  });
  if (error) return null;
  return (data ?? []) as EventPerson[];
}

/** A row's person id column and the embed `people` left null beside it. */
export type PersonEmbed = readonly [idKey: string, embedKey: string];

/**
 * Fills each embed the caller could not read from `event_people()`, in place.
 * A role holder's embeds are all present, so this costs them nothing; the RPC
 * runs once, and only when some row has an id with no person beside it.
 * Returns whether anything was filled, so a list ordered by the embed's name
 * knows to re-sort.
 */
export async function fillEventPeople(
  supabase: SupabaseClient,
  eventId: string,
  rows: readonly object[],
  embeds: readonly PersonEmbed[],
): Promise<boolean> {
  const missing = (
    row: Record<string, unknown>,
    [idKey, embedKey]: PersonEmbed,
  ) => typeof row[idKey] === "string" && row[embedKey] == null;
  const needed = rows.some((row) =>
    embeds.some((embed) => missing(row as Record<string, unknown>, embed)),
  );
  if (!needed) return false;

  const people = await listEventPeople(supabase, eventId);
  if (!people) return false;
  const byId = new Map(people.map((person) => [person.id, person]));

  let filled = false;
  for (const row of rows as Record<string, unknown>[]) {
    for (const embed of embeds) {
      if (!missing(row, embed)) continue;
      const person = byId.get(row[embed[0]] as string);
      if (!person) continue;
      row[embed[1]] = person;
      filled = true;
    }
  }
  return filled;
}

/** Re-sorts rows by their embedded person's name, as `order("person(name)")`. */
export function sortByPersonName<
  T extends { person: { name: string | null } | null },
>(rows: T[]): T[] {
  return rows.sort((a, b) => {
    const left = a.person?.name ?? null;
    const right = b.person?.name ?? null;
    if (left === null || right === null) {
      return left === right ? 0 : left === null ? 1 : -1;
    }
    return left.localeCompare(right);
  });
}
