import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { EventRegistrationForm } from "./event-registration-form-fields";
import { checkRegistrationWindow } from "./event-registration-form";

type PublicEventDetail = {
  id: string;
  name: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  description: string | null;
  event_type: string | null;
  venue: string | null;
  capacity: number | null;
  registration_enabled: boolean;
  registration_deadline: string | null;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "full",
  timeStyle: "short",
});

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

  return { title: event ? `${event.name} | Chatter Snow` : "Event | Chatter Snow" };
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
      "id, name, location, starts_at, ends_at, timezone, description, event_type, venue, capacity, registration_enabled, registration_deadline"
    )
    .eq("id", id)
    .maybeSingle<PublicEventDetail>();

  if (!event) notFound();

  const registrationWindow = checkRegistrationWindow(event);

  return (
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <section>
          <p className="app-eyebrow">{event.event_type ?? "Event"}</p>
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {event.name}
          </h1>
          <p className="app-muted mt-4 text-sm sm:text-base">
            {dateFormatter.format(new Date(event.starts_at))}
            {event.ends_at && ` – ${dateFormatter.format(new Date(event.ends_at))}`}
          </p>
          {(event.venue || event.location) && (
            <p className="app-muted text-sm sm:text-base">{event.venue ?? event.location}</p>
          )}
          {event.description && (
            <p className="mt-6 max-w-2xl text-sm leading-relaxed sm:text-base">{event.description}</p>
          )}
        </section>

        <section className="mt-10 max-w-lg">
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em]">Register</h2>
          <div className="mt-4">
            {registrationWindow.open ? (
              <EventRegistrationForm eventId={event.id} />
            ) : (
              <p className="app-muted text-sm">{registrationWindow.reason}</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
