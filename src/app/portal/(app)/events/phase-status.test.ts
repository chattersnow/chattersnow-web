import { describe, expect, test } from "bun:test";
import type { EventRow } from "./event-badges";
import {
  afterStatus,
  duringStatus,
  phaseStatus,
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
  event_type: null,
  venue: null,
  capacity: null,
  registration_enabled: false,
  registration_deadline: null,
  budget_amount: null,
  event_lead_id: null,
  report_status: "not_started",
  report_summary: null,
  lessons_learned: null,
  feedback_notes: null,
  content_notes: null,
  report_submitted_at: null,
  report_submitted_by: null,
  program_id: null,
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

describe("phaseStatus", () => {
  const now = new Date("2026-09-01T12:00:00Z");

  test("delegates to planningStatus for the planning phase", () => {
    const event = { ...baseEvent, event_lead_id: "person-1" };
    expect(phaseStatus("planning", event, now)).toBe(planningStatus(event));
  });

  test("delegates to duringStatus for the during phase, threading now through", () => {
    const event = { ...baseEvent, starts_at: "2026-08-30T12:00:00Z" };
    expect(phaseStatus("during", event, now)).toBe(duringStatus(event, now));
  });

  test("delegates to afterStatus for the after phase", () => {
    const event = { ...baseEvent, report_status: "submitted" };
    expect(phaseStatus("after", event, now)).toBe(afterStatus(event));
  });

  test("returns null for the basic phase, which has no status", () => {
    expect(phaseStatus("basic", baseEvent, now)).toBeNull();
  });
});
