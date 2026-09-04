import type { EventRow, PhaseStatus } from "./event-badges";

export const PHASE_KEYS = ["basic", "planning", "during", "after"] as const;

export type PhaseKey = (typeof PHASE_KEYS)[number];

export function isPhaseKey(value: string): value is PhaseKey {
  return (PHASE_KEYS as readonly string[]).includes(value);
}

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
  // Deliberately keyed off the typed headcount rather than check-ins:
  // events.attendance_count is the authoritative participant number, and
  // check-in figures are reference (see 20260904020000).
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

export type EventTaskKind =
  "planning" | "attendance" | "report" | "impact" | "checklist";

/**
 * Which phase each kind of outstanding work belongs to.
 *
 * The phase strip counts tasks through this map rather than asking each phase
 * "are your three columns filled in?", so a phase's indicator is structurally
 * about the work in that phase and adding a rule is a one-line change here.
 */
export const TASK_KIND_PHASE: Record<EventTaskKind, PhaseKey> = {
  checklist: "basic",
  planning: "planning",
  attendance: "during",
  report: "after",
  impact: "after",
};

export type EventPhaseTask = {
  kind: Exclude<EventTaskKind, "checklist">;
  taskLabel: string;
  tab: string;
};

export type EventPhaseSignals = {
  /** Whether an event_impact_notes row exists for this event. */
  hasImpactNote: boolean;
};

/**
 * The outstanding work on an event, as named tasks rather than a phase-level
 * "Not started / In progress / Done".
 *
 * Shared by the dashboard's Outstanding tasks list and the event detail page's
 * phase strip so the two can't disagree about what's left to do.
 *
 * `includeImpact` is off by default: the rule is useful on the event page, but
 * switching it on for the dashboard would add an outstanding task to every past
 * event at once the day it ships.
 */
export function deriveEventPhaseTasks(
  event: EventRow,
  signals: EventPhaseSignals,
  now: Date = new Date(),
  options: { includeImpact?: boolean } = {},
): EventPhaseTask[] {
  const tasks: EventPhaseTask[] = [];
  const hasStarted = new Date(event.starts_at) <= now;

  if (!hasStarted && planningStatus(event) !== "done") {
    tasks.push({
      kind: "planning",
      taskLabel: "Planning incomplete",
      tab: "planning",
    });
  }

  if (duringStatus(event, now) === "in_progress") {
    tasks.push({
      kind: "attendance",
      taskLabel: "Attendance not logged",
      tab: "attendance",
    });
  }

  if (hasStarted && afterStatus(event) !== "done") {
    tasks.push({
      kind: "report",
      taskLabel: "After-report not started",
      tab: "report",
    });
  }

  if (options.includeImpact && hasStarted && !signals.hasImpactNote) {
    tasks.push({
      kind: "impact",
      taskLabel: "Impact not recorded",
      tab: "impact",
    });
  }

  return tasks;
}

/**
 * Outstanding task labels per phase, for the detail page's phase strip.
 * Checklist items are passed in already-counted since they live in their own
 * table rather than on the event row.
 */
export function eventPhaseTaskLabels(
  event: EventRow,
  signals: EventPhaseSignals & { openChecklistTitles: string[] },
  now: Date = new Date(),
): Record<PhaseKey, string[]> {
  const labels: Record<PhaseKey, string[]> = {
    basic: [],
    planning: [],
    during: [],
    after: [],
  };

  for (const task of deriveEventPhaseTasks(event, signals, now, {
    includeImpact: true,
  })) {
    labels[TASK_KIND_PHASE[task.kind]].push(task.taskLabel);
  }

  labels[TASK_KIND_PHASE.checklist].push(...signals.openChecklistTitles);

  return labels;
}
