import { Card, CardContent } from "@/components/ui/card";

export type PublicEvent = {
  id: string;
  name: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function EventCard({ event }: { event: PublicEvent }) {
  return (
    <Card>
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
