"use client";

import { EVENT_TYPES, eventTypeLabel } from "@/lib/event-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NO_TYPE = "none";

/**
 * The one event type picker, shared by the create dialog and the event
 * detail Overview card so the two cannot drift.
 *
 * `events.event_type` is unconstrained text (see `@/lib/event-types`), so a
 * value outside `EVENT_TYPES` is offered as an extra option rather than
 * dropped -- otherwise opening an older event and saving anything else on the
 * card would silently clear a type the public site is already showing.
 */
export function EventTypeSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const isKnown = EVENT_TYPES.some((type) => type.value === value);

  return (
    <Select
      value={value || NO_TYPE}
      onValueChange={(next) => onChange(!next || next === NO_TYPE ? "" : next)}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="No type" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_TYPE}>No type</SelectItem>
        {EVENT_TYPES.map((type) => (
          <SelectItem key={type.value} value={type.value}>
            {type.label}
          </SelectItem>
        ))}
        {value && !isKnown && (
          <SelectItem value={value}>{eventTypeLabel(value)}</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
