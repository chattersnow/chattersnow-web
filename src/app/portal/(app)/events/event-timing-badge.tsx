"use client";

import { StatusBadge, type StatusTone } from "@/components/portal/status-badge";
import { useViewerTimeZone } from "@/hooks/use-viewer-time-zone";
import { eventTiming, type EventTiming, type EventWindow } from "@/lib/time";

const TIMING: Record<EventTiming, { label: string; tone: StatusTone }> = {
  upcoming: { label: "Upcoming", tone: "info" },
  today: { label: "Today", tone: "warning" },
  past: { label: "Past", tone: "neutral" },
};

/**
 * Where an event sits in time, worked out from its dates (#1609) -- the part
 * of "is this done?" that a stored `completed` status used to ask someone to
 * remember. "Today" is the viewer's today, per the portal's datetime policy;
 * until the browser has said which zone that is, the event's own zone stands
 * in, as it does for `ViewerTime` inside an event.
 *
 * `nowIso` comes from the server render so the server HTML and the first
 * client render agree on the instant being compared against.
 */
export function EventTimingBadge({
  event,
  nowIso,
}: {
  event: EventWindow;
  nowIso: string;
}) {
  const viewerZone = useViewerTimeZone();
  const timing = eventTiming(
    { ...event, timezone: viewerZone ?? event.timezone },
    new Date(nowIso),
  );
  const { label, tone } = TIMING[timing];
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}
