import { CalendarItemCard } from "./calendar-item-card";
import type { PublicCalendarItem } from "./calendar-shared";

export function CalendarListView({ items, now }: { items: PublicCalendarItem[]; now: number }) {
  if (items.length === 0) {
    return (
      <p className="app-muted py-16 text-center text-sm">
        No items match your filters. Try a different month or category.
      </p>
    );
  }

  const upcoming = items
    .filter((item) => new Date(item.ends_at ?? item.starts_at).getTime() >= now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const past = items
    .filter((item) => new Date(item.ends_at ?? item.starts_at).getTime() < now)
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());

  return (
    <div className="space-y-12">
      <section>
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <p className="app-muted mt-4 text-sm">Nothing upcoming right now.</p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((item) => (
              <CalendarItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Past
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((item) => (
              <CalendarItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
