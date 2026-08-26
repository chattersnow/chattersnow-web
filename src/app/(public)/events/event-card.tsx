import { Card, CardContent } from "@/components/ui/card";
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

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

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
          {dateFormatter.format(new Date(event.starts_at))}
          {event.ends_at &&
            ` – ${dateFormatter.format(new Date(event.ends_at))}`}
        </p>
        {event.location && (
          <p className="text-xs text-muted-foreground">{event.location}</p>
        )}
      </CardContent>
    </Card>
  );
}
