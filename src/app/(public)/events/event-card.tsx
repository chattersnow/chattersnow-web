import Image from "next/image";
import { ImageOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTimeInZone } from "@/lib/time";
import { resolveImageUrl } from "@/lib/inventory";
import type { PublicEventSponsor } from "./event-sponsors";

export type PublicEvent = {
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
  flier_url: string | null;
  sponsors: PublicEventSponsor[];
};

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

export function EventCard({
  event,
  onSelect,
}: {
  event: PublicEvent;
  onSelect: () => void;
}) {
  const imageUrl = resolveImageUrl(event.flier_url);

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
          keyEvent.preventDefault();
          onSelect();
        }
      }}
      className="rainbow-ring-hover cursor-pointer gap-0 overflow-hidden py-0"
    >
      <div className="relative aspect-[16/9] w-full bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={event.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="size-6 text-muted-foreground" aria-hidden />
          </div>
        )}
      </div>
      <CardContent className="space-y-1 px-4 py-3">
        <p className="text-sm font-medium">{event.name}</p>
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
