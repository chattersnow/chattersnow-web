"use client";

import { useState } from "react";
import { EventCard, type PublicEvent } from "./event-card";
import { EventDetailSheet } from "./event-detail-sheet";

export function EventList({
  events,
  now,
}: {
  events: PublicEvent[];
  now: number;
}) {
  const [selectedEvent, setSelectedEvent] = useState<PublicEvent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  function openEvent(event: PublicEvent) {
    setSelectedEvent(event);
    setDetailOpen(true);
  }

  if (events.length === 0) {
    return (
      <p className="app-muted py-16 text-center text-sm">No events yet.</p>
    );
  }

  const upcoming = events
    .filter(
      (event) => new Date(event.ends_at ?? event.starts_at).getTime() >= now,
    )
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );
  const past = events
    .filter(
      (event) => new Date(event.ends_at ?? event.starts_at).getTime() < now,
    )
    .sort(
      (a, b) =>
        new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
    );

  return (
    <div className="space-y-12">
      <section>
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          Upcoming events
        </h2>
        {upcoming.length === 0 ? (
          <p className="app-muted mt-4 text-sm">
            No upcoming events right now.
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onSelect={() => openEvent(event)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          Past events
        </h2>
        {past.length === 0 ? (
          <p className="app-muted mt-4 text-sm">No past events yet.</p>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onSelect={() => openEvent(event)}
              />
            ))}
          </div>
        )}
      </section>

      <EventDetailSheet
        event={selectedEvent}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
