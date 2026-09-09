import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandImageFallback } from "@/components/brand-image-fallback";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeInZone } from "@/lib/time";
import { isRenderableImageSrc, resolveImageUrl } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import {
  eventProgramsLabel,
  type PublicEventProgram,
} from "../events/event-card";
import { checkRegistrationWindow } from "../events/event-registration-form";

/** How many upcoming events the home page lists. A tenant setting in #846 step 2. */
export const HOME_UPCOMING_LIMIT = 3;

/**
 * Matches the events listing and the event page, which both format in the
 * event's own zone. The home page used to format in the viewer's zone, so a
 * Vermont start time read differently here than everywhere else (#846).
 */
const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

/**
 * The columns of the event `public_events` exposes that the home page needs.
 * Narrower than the events listing's `PublicEvent`: the home card shows no
 * description, capacity or sponsors.
 */
export type HomeUpcomingEvent = {
  id: string;
  name: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  flier_url: string | null;
  registration_enabled: boolean;
  registration_deadline: string | null;
  programs: PublicEventProgram[];
};

/** The columns above, as a PostgREST select list. */
export const HOME_UPCOMING_EVENT_COLUMNS =
  "id, name, location, starts_at, ends_at, timezone, flier_url, registration_enabled, registration_deadline";

function formatWhen(event: HomeUpcomingEvent): string {
  const starts = formatDateTimeInZone(
    event.starts_at,
    event.timezone,
    DATE_FORMAT_OPTIONS,
    "en-US",
  );
  if (!event.ends_at) return starts;
  return `${starts} – ${formatDateTimeInZone(
    event.ends_at,
    event.timezone,
    DATE_FORMAT_OPTIONS,
    "en-US",
  )}`;
}

/**
 * A card is a link to the event's own page, not a button that opens a sheet.
 * `/events/[id]` has been live but unlinked since #178 moved the listing to a
 * detail sheet, so this is the only route to it from the site's own pages --
 * which is also what makes an event on the home page shareable (#846).
 */
function UpcomingEventCard({
  event,
  now,
  nextUpLabel,
}: {
  event: HomeUpcomingEvent;
  now: number;
  /** Rendered as the ribbon on the first card only. */
  nextUpLabel?: string;
}) {
  const imageUrl = resolveImageUrl(event.flier_url);
  const registration = checkRegistrationWindow(event, new Date(now));

  return (
    <Link
      href={`/events/${event.id}`}
      className="rainbow-ring-hover flex flex-col overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="relative aspect-[16/9] w-full bg-muted">
        {isRenderableImageSrc(imageUrl) ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <BrandImageFallback label="Flier coming soon" />
        )}
        {nextUpLabel && (
          <span
            style={{ backgroundImage: "var(--rainbow)" }}
            className="absolute top-2.5 left-2.5 rounded-full px-2.5 py-1 text-[0.625rem] font-bold tracking-[0.16em] text-white uppercase shadow-sm"
          >
            {nextUpLabel}
          </span>
        )}
      </div>

      <div className="space-y-1 px-4 py-3">
        <p className="app-eyebrow">{eventProgramsLabel(event.programs)}</p>
        <p className="text-base font-semibold tracking-[-0.01em]">
          {event.name}
        </p>
        <p className="app-muted text-xs">{formatWhen(event)}</p>
        {event.location && (
          <p className="text-xs text-muted-foreground">{event.location}</p>
        )}
        {event.registration_enabled && (
          // Badge rather than a hand-rolled pill: its variants are the shape
          // the status colours in globals.css were contrast-measured against.
          <Badge
            variant={registration.open ? "success" : "muted"}
            className="mt-2"
          >
            {registration.open ? "Registration open" : "Registration closed"}
          </Badge>
        )}
      </div>
    </Link>
  );
}

/**
 * Columns are capped at the number of events so the row is always full, and a
 * lone card is held to card width rather than stretched the width of the page.
 */
function gridClassName(count: number): string {
  if (count <= 1) return "grid-cols-1 max-w-sm";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
}

export function UpcomingEvents({
  events,
  now,
  eyebrow,
  heading,
  ctaLabel,
  nextUpLabel,
}: {
  events: HomeUpcomingEvent[];
  now: number;
  eyebrow: string;
  heading: string;
  ctaLabel: string;
  nextUpLabel: string;
}) {
  return (
    <section className="mt-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-fit">
          <span className="app-eyebrow">{eyebrow}</span>
          <h2 className="brand-display mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            {heading}
          </h2>
        </div>
        <Link
          href="/events"
          className="rainbow-underline inline-flex items-center gap-1 text-sm font-semibold text-[var(--purple)]"
        >
          {ctaLabel}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <div className={cn("mt-6 grid gap-4", gridClassName(events.length))}>
        {events.map((event, index) => (
          <UpcomingEventCard
            key={event.id}
            event={event}
            now={now}
            nextUpLabel={index === 0 ? nextUpLabel : undefined}
          />
        ))}
      </div>
    </section>
  );
}
