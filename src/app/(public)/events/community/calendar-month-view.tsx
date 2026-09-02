import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateInZone } from "@/lib/time";
import { ItemTypeBadge } from "./calendar-item-badge";
import type { PublicCalendarItem } from "./calendar-shared";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS_PER_DAY = 3;

function localYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseMonthKey(month: string): {
  year: number;
  monthIndex: number;
} {
  const [year, monthNum] = month.split("-").map(Number);
  return { year, monthIndex: monthNum - 1 };
}

export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(month: string, delta: number): string {
  const { year, monthIndex } = parseMonthKey(month);
  const next = new Date(year, monthIndex + delta, 1);
  return currentMonthKey(next);
}

function monthLabel(month: string): string {
  const { year, monthIndex } = parseMonthKey(month);
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthIndex, 1));
}

function buildGridDays(month: string): Date[] {
  const { year, monthIndex } = parseMonthKey(month);
  const firstOfMonth = new Date(year, monthIndex, 1);
  const gridStart = new Date(year, monthIndex, 1 - firstOfMonth.getDay());
  return Array.from(
    { length: 42 },
    (_, i) =>
      new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + i,
      ),
  );
}

export function CalendarMonthView({
  items,
  month,
  onMonthChange,
}: {
  items: PublicCalendarItem[];
  month: string;
  onMonthChange: (next: string) => void;
}) {
  const { monthIndex } = parseMonthKey(month);
  const days = buildGridDays(month);
  const todayKey = localYmd(new Date());

  const itemsByDay = new Map<string, PublicCalendarItem[]>();
  for (const item of items) {
    const key = formatDateInZone(new Date(item.starts_at), item.time_zone);
    const bucket = itemsByDay.get(key);
    if (bucket) bucket.push(item);
    else itemsByDay.set(key, [item]);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          size="icon-sm"
          onClick={() => onMonthChange(addMonths(month, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft />
        </Button>
        <p className="brand-display text-lg font-semibold">
          {monthLabel(month)}
        </p>
        <Button
          variant="secondary"
          size="icon-sm"
          onClick={() => onMonthChange(addMonths(month, 1))}
          aria-label="Next month"
        >
          <ChevronRight />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = localYmd(day);
          const dayItems = itemsByDay.get(key) ?? [];
          const inMonth = day.getMonth() === monthIndex;
          const isToday = key === todayKey;

          return (
            <Card
              key={key}
              className={`min-h-24 ${inMonth ? "" : "opacity-40"} ${isToday ? "border-[var(--purple-deep)]" : ""}`}
            >
              <CardContent className="space-y-1 p-2">
                <time dateTime={key} className="text-xs font-medium">
                  {day.getDate()}
                </time>
                {dayItems.slice(0, MAX_CHIPS_PER_DAY).map((item) => (
                  <div key={item.id} className="space-y-0.5">
                    <ItemTypeBadge itemType={item.item_type} />
                    {item.public_url ? (
                      <a
                        href={item.public_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-[11px] font-medium hover:underline"
                        title={item.title}
                      >
                        {item.title}
                      </a>
                    ) : (
                      <p
                        className="truncate text-[11px] font-medium"
                        title={item.title}
                      >
                        {item.title}
                      </p>
                    )}
                  </div>
                ))}
                {dayItems.length > MAX_CHIPS_PER_DAY && (
                  <p className="text-[11px] text-muted-foreground">
                    +{dayItems.length - MAX_CHIPS_PER_DAY} more
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
