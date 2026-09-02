import type { EventRow, PhaseStatus } from "./event-badges";

export type PhaseKey = "basic" | "planning" | "during" | "after";

export function planningStatus(event: EventRow): PhaseStatus {
  const signals = [event.event_lead_id, event.capacity, event.budget_amount];
  const present = signals.filter(
    (value) => value !== null && value !== undefined,
  ).length;
  if (present === 0) return "not_started";
  if (present === signals.length) return "done";
  return "in_progress";
}

export function duringStatus(
  event: EventRow,
  now: Date = new Date(),
): PhaseStatus {
  if (event.attendance_count !== null) return "done";
  return new Date(event.starts_at) <= now ? "in_progress" : "not_started";
}

export function afterStatus(event: EventRow): PhaseStatus {
  return event.report_status === "submitted"
    ? "done"
    : event.report_status === "in_progress"
      ? "in_progress"
      : "not_started";
}

export function phaseStatus(
  key: PhaseKey,
  event: EventRow,
  now: Date = new Date(),
): PhaseStatus | null {
  if (key === "planning") return planningStatus(event);
  if (key === "during") return duringStatus(event, now);
  if (key === "after") return afterStatus(event);
  return null;
}
