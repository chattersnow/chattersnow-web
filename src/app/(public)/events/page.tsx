import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { nowMs } from "@/lib/time";
import { EventList } from "./event-list";
import type { PublicEventSponsor } from "./event-sponsors";

export const metadata: Metadata = {
  title: "Events | Chatter Snow",
};

export default async function EventsPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: events }, { data: sponsorRows }] = await Promise.all([
    supabase
      .from("public_events")
      .select(
        "id, name, location, starts_at, ends_at, timezone, description, event_type, venue, capacity, registration_enabled, registration_deadline",
      )
      .order("starts_at", { ascending: true }),
    supabase
      .from("public_event_sponsors")
      .select("sponsor_id, event_id, name, logo_url, website")
      .returns<(PublicEventSponsor & { event_id: string })[]>(),
  ]);

  const sponsorsByEvent = new Map<string, PublicEventSponsor[]>();
  for (const { event_id, ...sponsor } of sponsorRows ?? []) {
    const existing = sponsorsByEvent.get(event_id) ?? [];
    existing.push(sponsor);
    sponsorsByEvent.set(event_id, existing);
  }
  const eventsWithSponsors = (events ?? []).map((event) => ({
    ...event,
    sponsors: sponsorsByEvent.get(event.id) ?? [],
  }));

  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <section>
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Upcoming &amp; past events
          </h1>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            Browse Chatter Snow events happening on and off the mountain.
          </p>
        </section>

        <div className="mt-10">
          <EventList events={eventsWithSponsors} now={nowMs()} />
        </div>
      </div>
    </main>
  );
}
