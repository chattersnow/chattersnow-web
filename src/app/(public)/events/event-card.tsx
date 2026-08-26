import { Card, CardContent } from "@/components/ui/card";
import { formatDateTimeInZone } from "@/lib/time";
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
      className="cursor-pointer transition-colors hover:border-[var(--purple-deep)]"
    >
      <CardContent className="space-y-1">
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
