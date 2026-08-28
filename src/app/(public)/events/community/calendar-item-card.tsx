import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTimeInZone } from "@/lib/time";
import { ItemTypeBadge } from "./calendar-item-badge";
import { categoryLabel, type PublicCalendarItem } from "./calendar-shared";

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

function formatInZone(iso: string, timeZone: string) {
  return formatDateTimeInZone(iso, timeZone, DATE_FORMAT_OPTIONS);
}

export function CalendarItemCard({ item }: { item: PublicCalendarItem }) {
  const categories = item.categories ?? [];

  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <ItemTypeBadge itemType={item.item_type} />
          {categories.map((category) => (
            <Badge key={category} variant="outline">
              {categoryLabel(category)}
            </Badge>
          ))}
        </div>

        <p className="text-sm font-medium">{item.title}</p>

        <p className="app-muted text-xs">
          <time dateTime={item.starts_at}>
            {formatInZone(item.starts_at, item.time_zone)}
          </time>
          {item.ends_at && (
            <>
              {" – "}
              <time dateTime={item.ends_at}>
                {formatInZone(item.ends_at, item.time_zone)}
              </time>
            </>
          )}
        </p>

        {item.summary && (
          <p className="text-xs text-muted-foreground">{item.summary}</p>
        )}

        {item.public_url && (
          <a
            href={item.public_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--purple-deep)] hover:underline"
          >
            Learn more
            <ExternalLink className="size-3" />
            <span className="sr-only"> (opens in new tab)</span>
          </a>
        )}
      </CardContent>
    </Card>
  );
}
