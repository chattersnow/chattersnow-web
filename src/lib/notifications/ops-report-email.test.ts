import { describe, expect, test } from "bun:test";
import { renderOpsReport } from "./ops-report-email";
import { buildOpsReport, type OpsReportSource } from "./ops-report";

const SITE = "https://chattersnow.org";
const NOW = new Date("2026-03-14T13:00:00Z");
const SINCE = new Date("2026-03-13T13:00:00Z");

function report(overrides: Partial<OpsReportSource> = {}) {
  const built = buildOpsReport(
    {
      pendingExpenseApprovals: 2,
      pendingReimbursementApprovals: 0,
      upcomingEvents: [],
      shiftCoverageGaps: [],
      newContactMessages: 1,
      newVolunteerApplications: 0,
      inKindDonations: 0,
      monetaryDonations: { count: 0, total: 0 },
      ...overrides,
    },
    { tenantId: "tenant-1", now: NOW, since: SINCE },
  );
  if (!built) throw new Error("expected a report");
  return built;
}

describe("renderOpsReport subject", () => {
  test("carries the day, so a run of these threads and searches", () => {
    expect(renderOpsReport(report(), SITE).subject).toBe(
      "Daily ops report, 2026-03-14",
    );
  });

  test("calls out the urgent lines when there are any", () => {
    const withGap = report({
      shiftCoverageGaps: [
        {
          shiftId: "shift-1",
          eventId: "event-1",
          eventName: "Spring session",
          label: "Basecamp AM",
          startsAt: "2026-03-16T16:00:00Z",
          timezone: "UTC",
          assigned: 1,
          target: 4,
        },
      ],
    });
    expect(renderOpsReport(withGap, SITE).subject).toBe(
      "Daily ops report, 2026-03-14 — 1 needing attention",
    );
  });
});

describe("renderOpsReport bodies", () => {
  test("both parts link absolutely, with no double slash", () => {
    const { text, html } = renderOpsReport(report(), `${SITE}/`);
    expect(text).toContain(`${SITE}/portal/finance/expenses?status=submitted`);
    expect(html).toContain(`${SITE}/portal/finance/expenses?status=submitted`);
    expect(text).not.toContain(`${SITE}//portal`);
  });

  test("says what window it covers, in the organization's zone", () => {
    const { text, html } = renderOpsReport(report(), SITE);
    // 13:00 UTC on the 13th is 7:00 in the morning in Denver, which is when
    // the job actually runs -- rendering it in the server's UTC would read as
    // a report covering since 1pm.
    //
    // Asserted piece by piece rather than as one literal: Intl's date/time
    // separator is an ICU detail, not ours ("Mar 13 at 7:00 AM" on macOS,
    // "Mar 13, 7:00 AM" on the Linux CI runner), and pinning it makes this
    // test fail on whichever machine it was not written on.
    for (const body of [text, html]) {
      expect(body).toContain("Covering everything since Mar 13");
      expect(body).toContain("7:00 AM MDT.");
    }
    expect(text).toStartWith("Covering everything since ");
  });

  test("both parts point at the setting that controls the list", () => {
    const { text, html } = renderOpsReport(report(), SITE);
    const settings = `${SITE}/portal/administration/organization-settings?tab=notifications`;
    expect(text).toContain(settings);
    expect(html).toContain(settings);
  });

  test("the text part carries every section title and line", () => {
    const { text } = renderOpsReport(report(), SITE);
    expect(text).toContain("WAITING ON AN APPROVER");
    expect(text).toContain("* 2 expenses waiting for approval");
    expect(text).toContain("NEW SINCE THE LAST REPORT");
    expect(text).toContain("* 1 contact message");
  });

  test("escapes an event name rather than letting it close a tag", () => {
    const { html } = renderOpsReport(
      report({
        upcomingEvents: [
          {
            id: "event-1",
            name: '</a><script>alert("x")</script>',
            startsAt: "2026-03-16T16:00:00Z",
            timezone: "UTC",
          },
        ],
      }),
      SITE,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
