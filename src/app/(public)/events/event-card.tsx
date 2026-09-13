import Image from "next/image";
import Link from "next/link";
import { BrandImageFallback } from "@/components/brand-image-fallback";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTimeInZone } from "@/lib/time";
import { resolveImageUrl } from "@/lib/inventory";
import type { PublicEventSponsor } from "./event-sponsors";
import { publicEventPath } from "./event-path";

export type PublicEvent = {
  id: string;
  name: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  description: string | null;
  capacity: number | null;
  registration_enabled: boolean;
  registration_deadline: string | null;
  flier_url: string | null;
  /** The programs this event counts toward, from public_event_programs. */
  programs: PublicEventProgram[];
  sponsors: PublicEventSponsor[];
};

export type PublicEventProgram = {
  program_id: string;
  name: string;
};

/**
 * The eyebrow above an event's title. Events aren't required to belong to a
 * program, so this falls back to plain "Event" the way the event-type label it
 * replaced did.
 */
export function eventProgramsLabel(programs: PublicEventProgram[]) {
  return programs.length > 0
    ? programs.map((program) => program.name).join(" \u00b7 ")
    : "Event";
}

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

/**
 * A card is a link to the event's own page. From the listing that URL is
 * intercepted into a sheet over the list, and everywhere else it is a full
 * navigation -- but either way it is a real anchor, so the event is
 * shareable, crawlable, and reachable by keyboard without a hand-rolled
 * key handler (#847).
 *
 * The anchor is the title, stretched over the whole card by its ::after: the
 * accessible name stays "Winter Gear Swap" rather than swallowing the flier's
 * alt text and the date line with it.
 */
export function EventCard({ event }: { event: PublicEvent }) {
  const imageUrl = resolveImageUrl(event.flier_url);

  return (
    <Card className="rainbow-ring-hover relative gap-0 overflow-hidden py-0">
      <div className="relative aspect-[16/9] w-full bg-muted">
        {imageUrl ? (
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
      </div>
      <CardContent className="space-y-1 px-4 py-3">
        <p className="text-sm font-medium">
          <Link
            href={publicEventPath(event.id)}
            className="after:absolute after:inset-0 after:content-['']"
          >
            {event.name}
          </Link>
        </p>
        <p className="app-muted text-xs">
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
          <p className="text-xs text-muted-foreground">{event.location}</p>
        )}
      </CardContent>
    </Card>
  );
}
