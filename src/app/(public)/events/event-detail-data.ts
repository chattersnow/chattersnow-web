import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  PublicEvent,
  PublicEventProgram,
  PublicEventRow,
} from "./event-card";
import type { PublicEventSponsor } from "./event-sponsors";

/**
 * The columns of `public_events` an event card or an event detail view needs,
 * as a PostgREST select list. Shared so the listing and the two detail
 * presentations cannot drift into reading different shapes of the same row.
 */
export const PUBLIC_EVENT_COLUMNS =
  "id, name, location, starts_at, ends_at, timezone, description, capacity, registration_enabled, registration_deadline, flier_url, adults_only";

/**
 * One event, with its sponsors and programs, for `/events/e/[id]`.
 *
 * Returns null when there is no such published event; the caller decides
 * whether that is a `notFound()` or something quieter.
 */
export async function loadEventDetail(id: string): Promise<PublicEvent | null> {
  const supabase = await createSupabaseServerClient();

  const { data: event } = await supabase
    .from("public_events")
    .select(PUBLIC_EVENT_COLUMNS)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<PublicEventRow>();

  if (!event) return null;

  const [{ data: sponsors }, { data: programs }] = await Promise.all([
    supabase
      .from("public_event_sponsors")
      .select("sponsor_id, name, logo_url, website")
      .eq("event_id", event.id)
      .overrideTypes<PublicEventSponsor[]>(),
    supabase
      .from("public_event_programs")
      .select("program_id, name")
      .eq("event_id", event.id)
      .overrideTypes<PublicEventProgram[]>(),
  ]);

  return { ...event, sponsors: sponsors ?? [], programs: programs ?? [] };
}
