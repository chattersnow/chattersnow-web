import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTimeInZone } from "@/lib/time";
import { resolveImageUrl } from "@/lib/inventory";
import { EventRegistrationForm } from "../event-registration-form-fields";
import { checkRegistrationWindow } from "../event-registration-form";
import {
  eventProgramsLabel,
  type PublicEvent,
  type PublicEventProgram,
} from "../event-card";
import { EventSponsors, type PublicEventSponsor } from "../event-sponsors";

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "full",
  timeStyle: "short",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("public_events")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  return {
    title: event ? `${event.name} | Chatter Snow` : "Event | Chatter Snow",
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: event } = await supabase
    .from("public_events")
    .select(
      "id, name, location, starts_at, ends_at, timezone, description, capacity, registration_enabled, registration_deadline, flier_url",
    )
    .eq("id", id)
    .maybeSingle<Omit<PublicEvent, "sponsors" | "programs">>();

  if (!event) notFound();

  const registrationWindow = checkRegistrationWindow(event);
  const imageUrl = resolveImageUrl(event.flier_url);

  const [{ data: sponsors }, { data: programs }] = await Promise.all([
    supabase
      .from("public_event_sponsors")
      .select("sponsor_id, name, logo_url, website")
      .eq("event_id", event.id)
      .returns<PublicEventSponsor[]>(),
    supabase
      .from("public_event_programs")
      .select("program_id, name")
      .eq("event_id", event.id)
      .returns<PublicEventProgram[]>(),
  ]);

  return (
    <PageShell maxWidth="max-w-3xl">
      {imageUrl && (
        <div className="relative mb-6 aspect-[16/9] w-full overflow-hidden rounded-lg bg-muted">
          <Image
            src={imageUrl}
            alt={event.name}
            fill
            sizes="(min-width: 768px) 768px, 100vw"
            className="object-cover"
            priority
          />
        </div>
      )}
      <section>
        <p className="app-eyebrow">{eventProgramsLabel(programs ?? [])}</p>
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          {event.name}
        </h1>
        <p className="app-muted mt-4 text-sm sm:text-base">
          {formatDateTimeInZone(
            event.starts_at,
            event.timezone,
            DATE_FORMAT_OPTIONS,
            "en-US",
          )}
          {event.ends_at &&
            ` – ${formatDateTimeInZone(event.ends_at, event.timezone, DATE_FORMAT_OPTIONS, "en-US")}`}
        </p>
        {event.location && (
          <p className="app-muted text-sm sm:text-base">{event.location}</p>
        )}
        {event.description && (
          <p className="mt-6 max-w-2xl text-sm leading-relaxed sm:text-base">
            {event.description}
          </p>
        )}
      </section>

      <EventSponsors sponsors={sponsors ?? []} />

      {event.registration_enabled && (
        <section className="mt-10 max-w-lg">
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Register
          </h2>
          <div className="mt-4">
            {registrationWindow.open ? (
              <EventRegistrationForm eventId={event.id} />
            ) : (
              <p className="app-muted text-sm">{registrationWindow.reason}</p>
            )}
          </div>
        </section>
      )}
    </PageShell>
  );
}
