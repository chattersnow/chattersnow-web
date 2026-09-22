import { describe, expect, test } from "bun:test";
import {
  acknowledgementState,
  appealReviewerOverlap,
  appealWindowState,
  awaitingAcknowledgement,
  activeReviewers,
  isoDayPlus,
  NO_CONDUCT_PROCESS,
  reviewerShortfall,
  type ConductProcess,
  type ConductReviewer,
} from "./conduct";

/** Chatter Snow's own published numbers, which is what #687 is measured in. */
const PUBLISHED: ConductProcess = {
  acknowledgementDays: 5,
  appealDays: 14,
  reviewerMinimum: 2,
  appealExcludesOriginalReviewers: true,
};

describe("isoDayPlus", () => {
  test("crosses a month boundary without sliding a day", () => {
    expect(isoDayPlus("2026-01-30", 5)).toBe("2026-02-04");
  });

  // The reason the arithmetic goes through utcDateFromIsoDay rather than
  // `new Date("2026-03-08")`: a machine west of UTC parses that as local
  // midnight and lands a day early once the clocks move.
  test("crosses a daylight-saving boundary without sliding a day", () => {
    expect(isoDayPlus("2026-03-06", 5)).toBe("2026-03-11");
    expect(isoDayPlus("2026-10-30", 5)).toBe("2026-11-04");
  });

  test("crosses a leap day", () => {
    expect(isoDayPlus("2028-02-27", 3)).toBe("2028-03-01");
  });
});

describe("acknowledgementState", () => {
  // The state most tenants are in, and the one that must never break: an
  // organization that has published no commitment gets no indicator at all,
  // not a default one.
  test("is unmeasured when the organization has published no clock", () => {
    expect(
      acknowledgementState(
        { received_on: "2026-09-01", acknowledged_on: null },
        NO_CONDUCT_PROCESS,
        "2026-09-30",
      ),
    ).toEqual({ state: "unmeasured", acknowledgedOn: null });
  });

  test("counts down while the window is open", () => {
    expect(
      acknowledgementState(
        { received_on: "2026-09-01", acknowledged_on: null },
        PUBLISHED,
        "2026-09-03",
      ),
    ).toEqual({ state: "due", dueOn: "2026-09-06", daysLeft: 3 });
  });

  test("the due date itself is still inside the window", () => {
    expect(
      acknowledgementState(
        { received_on: "2026-09-01", acknowledged_on: null },
        PUBLISHED,
        "2026-09-06",
      ),
    ).toEqual({ state: "due", dueOn: "2026-09-06", daysLeft: 0 });
  });

  test("counts up once it has passed", () => {
    expect(
      acknowledgementState(
        { received_on: "2026-09-01", acknowledged_on: null },
        PUBLISHED,
        "2026-09-09",
      ),
    ).toEqual({ state: "overdue", dueOn: "2026-09-06", daysLate: 3 });
  });

  // The question asked after the fact is never "is it acknowledged" but "was
  // it acknowledged in time", so the answer survives the acknowledgement.
  test("an acknowledged report still reports whether it was late", () => {
    expect(
      acknowledgementState(
        { received_on: "2026-09-01", acknowledged_on: "2026-09-04" },
        PUBLISHED,
        "2026-09-30",
      ),
    ).toEqual({
      state: "acknowledged",
      acknowledgedOn: "2026-09-04",
      dueOn: "2026-09-06",
      late: false,
    });

    expect(
      acknowledgementState(
        { received_on: "2026-09-01", acknowledged_on: "2026-09-11" },
        PUBLISHED,
        "2026-09-30",
      ),
    ).toMatchObject({ state: "acknowledged", late: true });
  });

  test("awaitingAcknowledgement is the queue's filter", () => {
    const received = { received_on: "2026-09-01", acknowledged_on: null };
    expect(
      awaitingAcknowledgement(
        acknowledgementState(received, PUBLISHED, "2026-09-03"),
      ),
    ).toBe(true);
    expect(
      awaitingAcknowledgement(
        acknowledgementState(received, PUBLISHED, "2026-09-30"),
      ),
    ).toBe(true);
    // No published clock means nothing is waiting on one.
    expect(
      awaitingAcknowledgement(
        acknowledgementState(received, NO_CONDUCT_PROCESS, "2026-09-30"),
      ),
    ).toBe(false);
    expect(
      awaitingAcknowledgement(
        acknowledgementState(
          { received_on: "2026-09-01", acknowledged_on: "2026-09-02" },
          PUBLISHED,
          "2026-09-30",
        ),
      ),
    ).toBe(false);
  });
});

describe("appealWindowState", () => {
  test("nothing to count before a decision", () => {
    expect(
      appealWindowState({ decided_on: null }, null, PUBLISHED, "2026-09-30"),
    ).toEqual({ state: "unmeasured" });
  });

  test("nothing to count when the organization publishes no window", () => {
    expect(
      appealWindowState(
        { decided_on: "2026-09-01" },
        null,
        NO_CONDUCT_PROCESS,
        "2026-09-30",
      ),
    ).toEqual({ state: "unmeasured" });
  });

  test("open, then closed", () => {
    expect(
      appealWindowState(
        { decided_on: "2026-09-01" },
        null,
        PUBLISHED,
        "2026-09-10",
      ),
    ).toEqual({ state: "open", closesOn: "2026-09-15", daysLeft: 5 });

    expect(
      appealWindowState(
        { decided_on: "2026-09-01" },
        null,
        PUBLISHED,
        "2026-09-16",
      ),
    ).toEqual({ state: "closed", closesOn: "2026-09-15" });
  });

  // A late appeal is recorded and shown as late, never refused: the window is
  // a commitment to hear one filed inside it, not a rule against hearing one
  // that arrives after.
  test("a late appeal is filed and flagged, not rejected", () => {
    expect(
      appealWindowState(
        { decided_on: "2026-09-01" },
        { filed_on: "2026-09-20" },
        PUBLISHED,
        "2026-09-30",
      ),
    ).toEqual({
      state: "filed",
      filedOn: "2026-09-20",
      closesOn: "2026-09-15",
      late: true,
    });
  });

  test("an appeal on a tenant with no window is never late", () => {
    expect(
      appealWindowState(
        { decided_on: "2026-09-01" },
        { filed_on: "2026-12-25" },
        NO_CONDUCT_PROCESS,
        "2026-12-31",
      ),
    ).toEqual({
      state: "filed",
      filedOn: "2026-12-25",
      closesOn: null,
      late: false,
    });
  });
});

describe("reviewers", () => {
  const reviewers: ConductReviewer[] = [
    { user_id: "a", stage: "review", recused_on: null },
    { user_id: "b", stage: "review", recused_on: "2026-09-04" },
    { user_id: "c", stage: "appeal", recused_on: null },
  ];

  test("a recused reviewer does not count towards the minimum", () => {
    expect(activeReviewers(reviewers, "review").map((r) => r.user_id)).toEqual([
      "a",
    ]);
    expect(reviewerShortfall(reviewers, "review", PUBLISHED)).toBe(1);
  });

  test("no shortfall once the minimum is met", () => {
    expect(
      reviewerShortfall(
        [...reviewers, { user_id: "d", stage: "review", recused_on: null }],
        "review",
        PUBLISHED,
      ),
    ).toBe(0);
  });

  test("no minimum means no shortfall to report", () => {
    expect(reviewerShortfall(reviewers, "review", NO_CONDUCT_PROCESS)).toBe(
      null,
    );
  });

  // Being assigned the original review counts even if you then recused
  // yourself: you were party to the decision either way, which is what "not
  // part of the original decision" means.
  test("overlap counts a recused original reviewer", () => {
    const overlapping: ConductReviewer[] = [
      { user_id: "b", stage: "appeal", recused_on: null },
      ...reviewers,
    ];
    expect(appealReviewerOverlap(overlapping, PUBLISHED)).toEqual(["b"]);
  });

  test("overlap is not a finding on a tenant that has not required it", () => {
    const overlapping: ConductReviewer[] = [
      { user_id: "a", stage: "appeal", recused_on: null },
      ...reviewers,
    ];
    expect(appealReviewerOverlap(overlapping, NO_CONDUCT_PROCESS)).toEqual([]);
    expect(appealReviewerOverlap(overlapping, PUBLISHED)).toEqual(["a"]);
  });
});
