import { describe, expect, test } from "bun:test";
import {
  groupEventTasksByEvent,
  type EventTaskItem,
  type EventTaskKind,
} from "./attention-items";

function task(
  eventId: string,
  eventStartsAt: string,
  kind: EventTaskKind,
  taskLabel: string = kind,
): EventTaskItem {
  return {
    key: `${kind}_${eventId}_${taskLabel}`,
    eventId,
    eventName: `Event ${eventId}`,
    eventStartsAt,
    kind,
    taskLabel,
    href: `/portal/events/${eventId}?tab=${kind}`,
  };
}

describe("groupEventTasksByEvent", () => {
  test("returns no groups for no tasks", () => {
    expect(groupEventTasksByEvent([])).toEqual([]);
  });

  test("collapses tasks for the same event into one group", () => {
    const groups = groupEventTasksByEvent([
      task("a", "2026-09-10T00:00:00+00:00", "attendance"),
      task("a", "2026-09-10T00:00:00+00:00", "report"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].eventId).toBe("a");
    expect(groups[0].eventName).toBe("Event a");
    expect(groups[0].tasks).toHaveLength(2);
  });

  test("orders groups by event start date, most overdue first", () => {
    const groups = groupEventTasksByEvent([
      task("later", "2026-10-01T00:00:00+00:00", "planning"),
      task("earlier", "2026-08-01T00:00:00+00:00", "report"),
      task("middle", "2026-09-01T00:00:00+00:00", "report"),
    ]);

    expect(groups.map((group) => group.eventId)).toEqual([
      "earlier",
      "middle",
      "later",
    ]);
  });

  test("orders tasks within a group in event-lifecycle order", () => {
    // Checklist items are appended after every phase task by
    // getEventTaskSummary, so grouping has to reorder them back.
    const groups = groupEventTasksByEvent([
      task("a", "2026-09-10T00:00:00+00:00", "report"),
      task("a", "2026-09-10T00:00:00+00:00", "checklist", "Send thank-yous"),
      task("a", "2026-09-10T00:00:00+00:00", "planning"),
      task("a", "2026-09-10T00:00:00+00:00", "attendance"),
    ]);

    expect(groups[0].tasks.map((entry) => entry.kind)).toEqual([
      "planning",
      "attendance",
      "report",
      "checklist",
    ]);
  });

  test("keeps relative order of same-kind tasks", () => {
    const groups = groupEventTasksByEvent([
      task("a", "2026-09-10T00:00:00+00:00", "checklist", "First"),
      task("a", "2026-09-10T00:00:00+00:00", "checklist", "Second"),
    ]);

    expect(groups[0].tasks.map((entry) => entry.taskLabel)).toEqual([
      "First",
      "Second",
    ]);
  });
});
