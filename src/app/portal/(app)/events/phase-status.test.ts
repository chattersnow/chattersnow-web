import { describe, expect, test } from "bun:test";
import type { EventRow } from "./event-badges";
import {
  afterStatus,
  deriveEventPhaseTasks,
  duringStatus,
  eventCardTaskLabels,
  planningStatus,
} from "./phase-status";

const baseEvent: EventRow = {
  id: "event-1",
  name: "Winter Coat Drive",
  location: null,
  starts_at: "2026-09-01T18:00:00Z",
  ends_at: null,
  timezone: "UTC",
  visibility: "private",
  status: "draft",
  attendance_count: null,
  attendance_notes: null,
  description: null,
  capacity: null,
  registration_enabled: false,
  auto_assign_discount_codes: false,
  registration_deadline: null,
  budget_amount: null,
  event_lead_id: null,
  event_lead: null,
  report_status: "not_started",
  report_summary: null,
  feedback_notes: null,
  content_notes: null,
  report_submitted_at: null,
  report_submitted_by: null,
  program_ids: [],
  flier_url: null,
};

describe("planningStatus", () => {
  test("reports not_started when no planning signals are present", () => {
    expect(planningStatus(baseEvent)).toBe("not_started");
  });

  test("reports in_progress when only one signal is present", () => {
    expect(planningStatus({ ...baseEvent, event_lead_id: "person-1" })).toBe(
      "in_progress",
    );
  });

  test("reports in_progress when two of three signals are present", () => {
    expect(
      planningStatus({
        ...baseEvent,
        event_lead_id: "person-1",
        capacity: 50,
      }),
    ).toBe("in_progress");
  });

  test("reports done when all three signals are present", () => {
    expect(
      planningStatus({
        ...baseEvent,
        event_lead_id: "person-1",
        capacity: 50,
        budget_amount: 500,
      }),
    ).toBe("done");
  });

  test("counts a zero budget_amount as present, not missing", () => {
    expect(
      planningStatus({
        ...baseEvent,
        event_lead_id: "person-1",
        capacity: 50,
        budget_amount: 0,
      }),
    ).toBe("done");
  });
});

describe("duringStatus", () => {
  const now = new Date("2026-09-01T12:00:00Z");

  test("reports done once attendance is recorded, even before the event starts", () => {
    expect(
      duringStatus(
        {
          ...baseEvent,
          attendance_count: 0,
          starts_at: "2026-09-05T12:00:00Z",
        },
        now,
      ),
    ).toBe("done");
  });

  test("reports not_started when attendance is unset and the event is in the future", () => {
    expect(
      duringStatus(
        {
          ...baseEvent,
          attendance_count: null,
          starts_at: "2026-09-05T12:00:00Z",
        },
        now,
      ),
    ).toBe("not_started");
  });

  test("reports in_progress at the exact start instant", () => {
    expect(
      duringStatus(
        { ...baseEvent, attendance_count: null, starts_at: now.toISOString() },
        now,
      ),
    ).toBe("in_progress");
  });

  test("reports in_progress once the event has started but attendance is unset", () => {
    expect(
      duringStatus(
        {
          ...baseEvent,
          attendance_count: null,
          starts_at: "2026-08-30T12:00:00Z",
        },
        now,
      ),
    ).toBe("in_progress");
  });
});

describe("afterStatus", () => {
  test("reports done when the report is submitted", () => {
    expect(afterStatus({ ...baseEvent, report_status: "submitted" })).toBe(
      "done",
    );
  });

  test("reports in_progress when the report is in progress", () => {
    expect(afterStatus({ ...baseEvent, report_status: "in_progress" })).toBe(
      "in_progress",
    );
  });

  test("reports not_started when the report has not been started", () => {
    expect(afterStatus({ ...baseEvent, report_status: "not_started" })).toBe(
      "not_started",
    );
  });

  test("falls back to not_started for an unrecognized report_status", () => {
    expect(afterStatus({ ...baseEvent, report_status: "archived" })).toBe(
      "not_started",
    );
  });
});

describe("deriveEventPhaseTasks", () => {
  const now = new Date("2026-09-01T12:00:00Z");
  const upcoming = { ...baseEvent, starts_at: "2026-09-10T12:00:00Z" };
  const started = { ...baseEvent, starts_at: "2026-08-30T12:00:00Z" };
  const labels = (event: EventRow) =>
    deriveEventPhaseTasks(event, {}, now).map((task) => task.taskLabel);

  test("an upcoming event with nothing filled in only owes planning", () => {
    expect(labels(upcoming)).toEqual(["Planning incomplete"]);
  });

  test("a fully planned upcoming event owes nothing", () => {
    expect(
      labels({
        ...upcoming,
        event_lead_id: "person-1",
        capacity: 40,
        budget_amount: 500,
      }),
    ).toEqual([]);
  });

  test("planning stops being outstanding once the event has started", () => {
    expect(labels(started)).not.toContain("Planning incomplete");
  });

  test("a started event with no attendance and no report owes both", () => {
    expect(labels(started)).toEqual([
      "Attendance not logged",
      "After-report not started",
    ]);
  });

  test("logging attendance clears the during task", () => {
    expect(labels({ ...started, attendance_count: 40 })).not.toContain(
      "Attendance not logged",
    );
  });

  test("submitting the report clears the after task", () => {
    expect(labels({ ...started, report_status: "submitted" })).not.toContain(
      "After-report not started",
    );
  });

  test("there is no separate impact task: the report covers it (#1588)", () => {
    const kinds = deriveEventPhaseTasks(started, {}, now, {
      includeRetro: true,
    }).map((task) => task.kind as string);
    expect(kinds).not.toContain("impact");
  });

  test("the retro rules are opt-in and land on the Results card", () => {
    const signals = {
      retroItemCount: 0,
      openActionItemCount: 0,
    };
    expect(
      deriveEventPhaseTasks(started, signals, now).map((t) => t.kind),
    ).not.toContain("retro");
    const tasks = deriveEventPhaseTasks(started, signals, now, {
      includeRetro: true,
    });
    expect(tasks.find((task) => task.kind === "retro")).toEqual({
      kind: "retro",
      taskLabel: "Retro not started",
      tab: "results",
    });
  });

  test("submitting the report clears an empty retro, not its open actions", () => {
    const tasks = deriveEventPhaseTasks(
      { ...started, report_status: "submitted" },
      { retroItemCount: 0, openActionItemCount: 0 },
      now,
      { includeRetro: true },
    );
    const retroKinds = (list: typeof tasks) =>
      list
        .filter(
          (task) => task.kind === "retro" || task.kind === "retro_actions",
        )
        .map((task) => task.taskLabel);
    expect(retroKinds(tasks)).toEqual([]);
    const withOpen = deriveEventPhaseTasks(
      { ...started, report_status: "submitted" },
      { retroItemCount: 1, openActionItemCount: 1 },
      now,
      { includeRetro: true },
    );
    expect(retroKinds(withOpen)).toEqual(["1 open action item"]);
  });

  test("a retro is not owed before the event starts", () => {
    const tasks = deriveEventPhaseTasks(upcoming, { retroItemCount: 0 }, now, {
      includeRetro: true,
    });
    expect(tasks.map((task) => task.kind)).not.toContain("retro");
  });

  test("open action items are counted until each is done", () => {
    const labelsFor = (open: number) =>
      deriveEventPhaseTasks(
        started,
        { retroItemCount: 3, openActionItemCount: open },
        now,
        { includeRetro: true },
      ).map((task) => task.taskLabel);
    expect(labelsFor(1)).toContain("1 open action item");
    expect(labelsFor(2)).toContain("2 open action items");
    expect(labelsFor(0).join()).not.toContain("open action item");
    expect(labelsFor(0)).not.toContain("Retro not started");
  });

  test("every task names the card it is done on", () => {
    const tasks = deriveEventPhaseTasks(started, {}, now, {
      includeRetro: true,
    });
    for (const task of tasks) {
      expect(task.tab).toBeTruthy();
    }
  });
});

describe("eventCardTaskLabels", () => {
  const now = new Date("2026-09-01T12:00:00Z");
  const started = { ...baseEvent, starts_at: "2026-08-30T12:00:00Z" };

  test("files each task under the card it is done on", () => {
    const labels = eventCardTaskLabels(
      started,
      { openChecklistTitles: [] },
      now,
    );

    // Keyed by card since #1008: the rail hangs the badge off Attendance and
    // Results themselves, rather than off a phase holding six cards.
    expect(labels.attendance).toEqual(["Attendance not logged"]);
    expect(labels.results).toEqual(["After-report not started"]);
    expect(labels.planning).toBeUndefined();
  });

  test("open checklist items land on the checklist card", () => {
    const labels = eventCardTaskLabels(
      started,
      {
        openChecklistTitles: ["Send thank-you emails", "Return the van"],
      },
      now,
    );

    expect(labels.checklist).toEqual([
      "Send thank-you emails",
      "Return the van",
    ]);
  });
});
