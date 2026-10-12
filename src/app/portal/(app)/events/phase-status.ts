import type { EventRow, PhaseStatus } from "./event-badges";
// Type-only, so the cycle with event-tabs-config (which reads PhaseKey from
// here) is erased at compile time and never reaches the bundle.
import type { TabValue } from "./event-tabs-config";

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
  | "planning"
  | "attendance"
  | "report"
  | "retro"
  | "retro_actions"
  | "checklist";

export type EventPhaseTask = {
  kind: Exclude<EventTaskKind, "checklist">;
  taskLabel: string;
  /** The card the task is done on -- what the detail page's rail hangs it off. */
  tab: TabValue;
};

// "Impact not recorded" folded into the report task (#1588): every impact
// figure is derived, so "recorded" can only mean the report.
export type EventPhaseSignals = {
  /** How many event_retro_items this event has (#1578). */
  retroItemCount?: number;
  /** This event's own action items still open (#1578). */
  openActionItemCount?: number;
};

/**
 * The outstanding work on an event, as named tasks rather than a phase-level
 * "Not started / In progress / Done".
 *
 * Shared by the dashboard's Outstanding tasks list and the event detail page's
 * section rail so the two can't disagree about what's left to do.
 *
 * `includeRetro` is off by default: the rule is useful on the event page, but
 * switching it on for the dashboard would add an outstanding task to every
 * past event at once the day it shipped.
 */
export function deriveEventPhaseTasks(
  event: EventRow,
  signals: EventPhaseSignals,
  now: Date = new Date(),
  options: { includeRetro?: boolean } = {},
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
      tab: "results",
    });
  }

  // A submitted report freezes the retro, so an empty one stops being work
  // anyone can do; open action items can still be closed, so they stay.
  if (
    options.includeRetro &&
    hasStarted &&
    afterStatus(event) !== "done" &&
    signals.retroItemCount === 0
  ) {
    tasks.push({
      kind: "retro",
      taskLabel: "Retro not started",
      tab: "results",
    });
  }

  const openActions = signals.openActionItemCount ?? 0;
  if (options.includeRetro && openActions > 0) {
    tasks.push({
      kind: "retro_actions",
      taskLabel: `${openActions} open action item${openActions === 1 ? "" : "s"}`,
      tab: "results",
    });
  }

  return tasks;
}

/**
 * Outstanding task labels per card, for the detail page's section rail.
 *
 * Keyed by card rather than by phase since #1008 replaced the phase strip with
 * the rail: "Attendance not logged" now sits on the Attendance row, where the
 * work is, instead of on a "During" tab the reader still had to open to find
 * out which of its six cards the count meant.
 *
 * Checklist items are passed in already-counted since they live in their own
 * table rather than on the event row.
 */
export function eventCardTaskLabels(
  event: EventRow,
  signals: EventPhaseSignals & { openChecklistTitles: string[] },
  now: Date = new Date(),
): Partial<Record<TabValue, string[]>> {
  const labels: Partial<Record<TabValue, string[]>> = {};
  const push = (tab: TabValue, label: string) => {
    (labels[tab] ??= []).push(label);
  };

  for (const task of deriveEventPhaseTasks(event, signals, now, {
    includeRetro: true,
  })) {
    push(task.tab, task.taskLabel);
  }

  for (const title of signals.openChecklistTitles) push("checklist", title);

  return labels;
}
