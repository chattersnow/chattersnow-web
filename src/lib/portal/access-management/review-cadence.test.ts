import { describe, expect, test } from "bun:test";
import {
  computeNextReviewDate,
  isReviewDue,
  mfaExpectationFor,
  reviewCadenceMonths,
  twoAdminExpectationFor,
} from "./review-cadence";

describe("reviewCadenceMonths", () => {
  test("annual for low and medium, 6 months for high, 3 months for critical", () => {
    expect(reviewCadenceMonths("low")).toBe(12);
    expect(reviewCadenceMonths("medium")).toBe(12);
    expect(reviewCadenceMonths("high")).toBe(6);
    expect(reviewCadenceMonths("critical")).toBe(3);
  });
});

describe("mfaExpectationFor", () => {
  test("recommended for low, required from medium up", () => {
    expect(mfaExpectationFor("low")).toBe("recommended");
    expect(mfaExpectationFor("medium")).toBe("required");
    expect(mfaExpectationFor("high")).toBe("required");
    expect(mfaExpectationFor("critical")).toBe("required");
  });
});

describe("twoAdminExpectationFor", () => {
  test("not applicable for low, recommended for medium, required from high up", () => {
    expect(twoAdminExpectationFor("low")).toBe("not_applicable");
    expect(twoAdminExpectationFor("medium")).toBe("recommended");
    expect(twoAdminExpectationFor("high")).toBe("required");
    expect(twoAdminExpectationFor("critical")).toBe("required");
  });
});

describe("computeNextReviewDate", () => {
  test("adds the sensitivity's cadence in whole calendar months", () => {
    const from = new Date("2026-08-28T12:00:00.000Z");
    expect(computeNextReviewDate("low", from)).toBe("2027-08-28");
    expect(computeNextReviewDate("high", from)).toBe("2027-02-28");
    expect(computeNextReviewDate("critical", from)).toBe("2026-11-28");
  });

  test("rolls over year and month boundaries", () => {
    const from = new Date("2026-12-15T00:00:00.000Z");
    expect(computeNextReviewDate("critical", from)).toBe("2027-03-15");
  });
});

describe("isReviewDue", () => {
  const today = new Date("2026-08-28T00:00:00.000Z");

  test("null next_review is never due", () => {
    expect(isReviewDue(null, today)).toBe(false);
  });

  test("a past or same-day next_review is due", () => {
    expect(isReviewDue("2026-08-27", today)).toBe(true);
    expect(isReviewDue("2026-08-28", today)).toBe(true);
  });

  test("a future next_review is not due", () => {
    expect(isReviewDue("2026-08-29", today)).toBe(false);
  });
});
