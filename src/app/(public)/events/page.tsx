import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { nowMs } from "@/lib/time";
import { EventList } from "./event-list";
import { PUBLIC_EVENT_COLUMNS } from "./event-detail-data";
import type { PublicEventSponsor } from "./event-sponsors";
import type { PublicEventProgram } from "./event-card";

import { getPublicSite, publicTitle } from "@/lib/public-site";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Events") };
}

export default async function EventsPage() {
  const supabase = await createSupabaseServerClient();

  const [
    { data: events },
    { data: sponsorRows },
    { data: programRows },
    { content },
  ] = await Promise.all([
    supabase
      .from("public_events")
      .select(PUBLIC_EVENT_COLUMNS)
      .order("starts_at", { ascending: true }),
    supabase
      .from("public_event_sponsors")
      .select("sponsor_id, event_id, name, logo_url, website")
      .returns<(PublicEventSponsor & { event_id: string })[]>(),
    supabase
      .from("public_event_programs")
      .select("event_id, program_id, name")
      .returns<(PublicEventProgram & { event_id: string })[]>(),
    getPublicSite(supabase),
  ]);

  const sponsorsByEvent = new Map<string, PublicEventSponsor[]>();
  for (const { event_id, ...sponsor } of sponsorRows ?? []) {
    const existing = sponsorsByEvent.get(event_id) ?? [];
    existing.push(sponsor);
    sponsorsByEvent.set(event_id, existing);
  }

  const programsByEvent = new Map<string, PublicEventProgram[]>();
  for (const { event_id, ...program } of programRows ?? []) {
    const existing = programsByEvent.get(event_id) ?? [];
    existing.push(program);
    programsByEvent.set(event_id, existing);
  }

  const eventsWithSponsors = (events ?? []).map((event) => ({
    ...event,
    programs: programsByEvent.get(event.id) ?? [],
    sponsors: sponsorsByEvent.get(event.id) ?? [],
  }));

  return (
    <PageShell>
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {content.text("events.heading")}
          </h1>
        </div>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {content.text("events.intro")}
        </p>
      </section>

      <div className="mt-10">
        <EventList events={eventsWithSponsors} now={nowMs()} />
      </div>
    </PageShell>
  );
}
