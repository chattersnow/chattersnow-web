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
  lessons_learned: null,
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
  const labels = (event: EventRow, options?: { includeImpact?: boolean }) =>
    deriveEventPhaseTasks(event, { hasImpactNote: false }, now, options).map(
      (task) => task.taskLabel,
    );

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

  test("the impact rule is opt-in, so the dashboard is unaffected by default", () => {
    expect(labels(started)).not.toContain("Impact not recorded");
    expect(labels(started, { includeImpact: true })).toContain(
      "Impact not recorded",
    );
  });

  test("an existing impact note clears the impact task", () => {
    const tasks = deriveEventPhaseTasks(started, { hasImpactNote: true }, now, {
      includeImpact: true,
    });
    expect(tasks.map((task) => task.taskLabel)).not.toContain(
      "Impact not recorded",
    );
  });

  test("every task names the card it is done on", () => {
    const tasks = deriveEventPhaseTasks(
      started,
      { hasImpactNote: false },
      now,
      {
        includeImpact: true,
      },
    );
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
      { hasImpactNote: false, openChecklistTitles: [] },
      now,
    );

    // Keyed by card since #1008: the rail hangs the badge off Attendance and
    // Report themselves, rather than off a phase holding six cards.
    expect(labels.attendance).toEqual(["Attendance not logged"]);
    expect(labels.report).toEqual(["After-report not started"]);
    expect(labels.impact).toEqual(["Impact not recorded"]);
    expect(labels.planning).toBeUndefined();
  });

  test("open checklist items land on the checklist card", () => {
    const labels = eventCardTaskLabels(
      started,
      {
        hasImpactNote: true,
        openChecklistTitles: ["Send thank-you emails", "Return the van"],
      },
      now,
    );

    expect(labels.checklist).toEqual([
      "Send thank-you emails",
      "Return the van",
    ]);
    expect(labels.impact).toBeUndefined();
  });
});
