import { describe, expect, test } from "bun:test";
import {
  MAX_LISTED_ROWS,
  OPS_REPORT_SOURCE_MODULES,
  buildOpsReport,
  isEmailAddress,
  opsReportDay,
  opsReportDedupeKey,
  opsReportSourceGates,
  parseOpsReportRecipients,
  type OpsReportSource,
} from "./ops-report";

const NOW = new Date("2026-03-14T13:00:00Z");
const SINCE = new Date("2026-03-13T13:00:00Z");

function source(overrides: Partial<OpsReportSource> = {}): OpsReportSource {
  return {
    pendingExpenseApprovals: 0,
    pendingReimbursementApprovals: 0,
    upcomingEvents: [],
    shiftCoverageGaps: [],
    newContactMessages: 0,
    newVolunteerApplications: 0,
    inKindDonations: 0,
    monetaryDonations: { count: 0, total: 0 },
    ...overrides,
  };
}

function build(overrides: Partial<OpsReportSource> = {}) {
  return buildOpsReport(source(overrides), {
    tenantId: "tenant-1",
    now: NOW,
    since: SINCE,
  });
}

function labels(report: ReturnType<typeof build>): string[] {
  return (report?.sections ?? []).flatMap((section) =>
    section.lines.map((line) => line.label),
  );
}

describe("parseOpsReportRecipients", () => {
  test("reads a JSON array, lowercased, deduped and sorted", () => {
    expect(
      parseOpsReportRecipients([
        "Board@example.org",
        "alex@example.org",
        "board@example.org",
      ]),
    ).toEqual(["alex@example.org", "board@example.org"]);
  });

  test("reads the separators an administrator actually types", () => {
    expect(
      parseOpsReportRecipients("a@example.org, b@example.org\nc@example.org"),
    ).toEqual(["a@example.org", "b@example.org", "c@example.org"]);
  });

  test("drops entries that are not addresses rather than mailing them", () => {
    expect(
      parseOpsReportRecipients("board, board@example.org, @example.org"),
    ).toEqual(["board@example.org"]);
  });

  test("an unset, empty or wrongly typed value is nobody", () => {
    expect(parseOpsReportRecipients(undefined)).toEqual([]);
    expect(parseOpsReportRecipients(null)).toEqual([]);
    expect(parseOpsReportRecipients("")).toEqual([]);
    expect(parseOpsReportRecipients("   ")).toEqual([]);
    expect(parseOpsReportRecipients(42)).toEqual([]);
    expect(parseOpsReportRecipients({ to: "board@example.org" })).toEqual([]);
  });
});

describe("isEmailAddress", () => {
  test("accepts an ordinary address and refuses a bare word or domain", () => {
    expect(isEmailAddress("board@example.org")).toBe(true);
    expect(isEmailAddress("board+ops@mail.example.co.uk")).toBe(true);
    expect(isEmailAddress("board")).toBe(false);
    expect(isEmailAddress("board@example")).toBe(false);
    expect(isEmailAddress("board @example.org")).toBe(false);
  });
});

describe("opsReportDay and opsReportDedupeKey", () => {
  test("the day is the organization's, not UTC's", () => {
    // 01:00 UTC on the 15th is still the evening of the 14th in Denver, and a
    // report keyed on the UTC date would send twice that night.
    expect(opsReportDay(new Date("2026-03-15T01:00:00Z"))).toBe("2026-03-14");
  });

  test("the key carries the day and the address", () => {
    expect(opsReportDedupeKey("2026-03-14", "board@example.org")).toBe(
      "ops-report:2026-03-14:board@example.org",
    );
  });
});

describe("buildOpsReport", () => {
  test("a quiet day is no email at all", () => {
    expect(build()).toBeNull();
  });

  test("counts the approval queues", () => {
    const report = build({
      pendingExpenseApprovals: 1,
      pendingReimbursementApprovals: 3,
    });
    expect(labels(report)).toEqual([
      "1 expense waiting for approval",
      "3 reimbursements waiting for approval",
    ]);
    expect(report?.sections[0].lines[0].href).toBe(
      "/portal/finance/expenses?status=submitted",
    );
  });

  test("a coverage gap is urgent and an upcoming event is not", () => {
    const report = build({
      upcomingEvents: [
        {
          id: "event-1",
          name: "Spring session",
          startsAt: "2026-03-16T16:00:00Z",
          timezone: "America/Denver",
        },
      ],
      shiftCoverageGaps: [
        {
          shiftId: "shift-1",
          eventId: "event-1",
          eventName: "Spring session",
          label: "Basecamp AM",
          startsAt: "2026-03-16T16:00:00Z",
          timezone: "America/Denver",
          assigned: 1,
          target: 4,
        },
      ],
    });

    const [gap, event] = report?.sections[0].lines ?? [];
    expect(gap.severity).toBe("urgent");
    expect(gap.label).toContain("Basecamp AM is 1 of 4 covered");
    expect(gap.href).toBe("/portal/events/event-1?tab=volunteers");
    // Rendered in the event's own zone, not the reporting machine's.
    expect(gap.label).toContain("10:00 AM MDT");
    expect(event.severity).toBe("info");
    expect(event.href).toBe("/portal/events/event-1");
  });

  test("gaps come before events, so the actionable line is read first", () => {
    const report = build({
      upcomingEvents: [
        {
          id: "event-1",
          name: "Spring session",
          startsAt: "2026-03-16T16:00:00Z",
          timezone: "UTC",
        },
      ],
      shiftCoverageGaps: [
        {
          shiftId: "shift-1",
          eventId: "event-1",
          eventName: "Spring session",
          label: "Basecamp AM",
          startsAt: "2026-03-16T16:00:00Z",
          timezone: "UTC",
          assigned: 0,
          target: 2,
        },
      ],
    });
    expect(report?.sections[0].lines[0].severity).toBe("urgent");
  });

  test("a long list is truncated and says so", () => {
    const report = build({
      upcomingEvents: Array.from({ length: MAX_LISTED_ROWS + 3 }, (_, i) => ({
        id: `event-${i}`,
        name: `Event ${i}`,
        startsAt: "2026-03-16T16:00:00Z",
        timezone: "UTC",
      })),
    });
    const lines = report?.sections[0].lines ?? [];
    expect(lines).toHaveLength(MAX_LISTED_ROWS + 1);
    expect(lines[lines.length - 1].label).toBe("and 3 more events");
  });

  test("counts what arrived since the last report", () => {
    const report = build({
      newContactMessages: 2,
      newVolunteerApplications: 1,
    });
    expect(labels(report)).toEqual([
      "2 contact messages",
      "1 volunteer application",
    ]);
    expect(report?.sections[0].title).toBe("New since the last report");
  });

  test("monetary donations carry their total, gear donations a count", () => {
    const report = build({
      inKindDonations: 5,
      monetaryDonations: { count: 2, total: 1250.5 },
    });
    expect(labels(report)).toEqual([
      "2 monetary donations, $1,250.50 in total",
      "5 gear donations received",
    ]);
  });

  test("empty sections are left out entirely", () => {
    const report = build({ newContactMessages: 1 });
    expect(report?.sections.map((section) => section.key)).toEqual([
      "new_since",
    ]);
    expect(report?.lineCount).toBe(1);
  });

  test("carries the tenant, the day and the window it covers", () => {
    const report = build({ newContactMessages: 1 });
    expect(report?.tenantId).toBe("tenant-1");
    expect(report?.day).toBe("2026-03-14");
    expect(report?.since).toBe(SINCE);
  });
});

describe("opsReportSourceGates", () => {
  const EVERY_FIELD = Object.keys(
    OPS_REPORT_SOURCE_MODULES,
  ) as (keyof OpsReportSource)[];

  test("lets every count through for a tenant holding every module", () => {
    const gates = opsReportSourceGates({
      finance: true,
      reimbursements: true,
      events: true,
      communications: true,
      volunteers: true,
      inventory: true,
    });
    for (const field of EVERY_FIELD) expect(gates[field]).toBe(true);
  });

  test("closes the counts a disabled module owns, and no others", () => {
    const gates = opsReportSourceGates({ finance: false });

    // Both halves of Finance, which sit in two different report sections.
    expect(gates.pendingExpenseApprovals).toBe(false);
    expect(gates.monetaryDonations).toBe(false);

    // Each of those sections keeps its other line: this is per count, not per
    // section, because the sections mix modules.
    expect(gates.pendingReimbursementApprovals).toBe(true);
    expect(gates.inKindDonations).toBe(true);
    expect(gates.newContactMessages).toBe(true);
    expect(gates.newVolunteerApplications).toBe(true);
    expect(gates.upcomingEvents).toBe(true);
    expect(gates.shiftCoverageGaps).toBe(true);
  });

  test("coverage gaps follow Events, not Volunteers", () => {
    const gates = opsReportSourceGates({ volunteers: false });
    expect(gates.shiftCoverageGaps).toBe(true);
    expect(gates.newVolunteerApplications).toBe(false);
  });

  test("fails open on a map that is empty or has never heard of a module", () => {
    // An unreadable answer and a map that predates a module both leave the
    // counts in -- the same direction as the coalesce at the bottom of
    // module_enabled_for_tenant().
    const gates = opsReportSourceGates({});
    for (const field of EVERY_FIELD) expect(gates[field]).toBe(true);
  });

  test("a tenant with every reported module off is sent nothing", () => {
    // The job skips the reads, so what it shapes is an all-zeros source -- and
    // that is the quiet day buildOpsReport already declines to send. Asserted
    // here so "no sections left" cannot quietly become "an email with nothing
    // in it".
    expect(build()).toBeNull();
  });
});
