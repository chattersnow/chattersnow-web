"use client";

import { useEffect, useState } from "react";
import { listMeetingEventOptionsAction } from "./actions";
import type { MeetingEvent } from "./meeting-badges";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatInstantDate } from "@/lib/format";

const NO_EVENT = "none";

function eventLabel(event: MeetingEvent) {
  return `${event.name} · ${formatInstantDate(event.starts_at)}`;
}

/** Loads the linkable events once `enabled` turns on (the form is open). */
export function useMeetingEventOptions(enabled: boolean) {
  const [events, setEvents] = useState<MeetingEvent[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    listMeetingEventOptionsAction().then((options) => {
      if (!cancelled) setEvents(options);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return events;
}

/**
 * The optional event a meeting is about (#1622). Renders nothing for a reader
 * with no events to pick from, the same way the conduct form's picker does.
 */
export function MeetingEventSelect({
  id,
  events,
  value,
  onChange,
}: {
  id: string;
  events: MeetingEvent[];
  value: string;
  onChange: (eventId: string) => void;
}) {
  if (events.length === 0) return null;

  return (
    <Field>
      <FieldLabel htmlFor={id}>Event</FieldLabel>
      <Select
        value={value || NO_EVENT}
        onValueChange={(next) =>
          onChange(next === NO_EVENT ? "" : (next ?? ""))
        }
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="No event">
            {(selected: string) => {
              const event = events.find((option) => option.id === selected);
              return event ? eventLabel(event) : "No event";
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_EVENT}>No event</SelectItem>
          {events.map((event) => (
            <SelectItem key={event.id} value={event.id}>
              {eventLabel(event)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
