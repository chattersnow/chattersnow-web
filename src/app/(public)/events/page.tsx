import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { nowMs } from "@/lib/time";
import { EventList } from "./event-list";

export const metadata: Metadata = {
  title: "Events | Chatter Snow",
};

export default async function EventsPage() {
  const supabase = await createSupabaseServerClient();

  const { data: events } = await supabase
    .from("public_events")
    .select(
      "id, name, location, starts_at, ends_at, timezone, description, event_type, venue, capacity, registration_enabled, registration_deadline",
    )
    .order("starts_at", { ascending: true });

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
          <EventList events={events ?? []} now={nowMs()} />
        </div>
      </div>
    </main>
  );
}
