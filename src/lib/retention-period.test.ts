import { describe, expect, test } from "bun:test";
import { formatRetentionPeriod } from "./retention-period";

describe("formatRetentionPeriod", () => {
  // The one that was actually wrong: portal_accounts is `interval '3 months'`,
  // which Postgres returns as "3 mons", and the ops portal rendered
  // "Kept for 3 mons".
  test("expands Postgres's abbreviated months", () => {
    expect(formatRetentionPeriod("3 mons")).toBe("3 months");
    expect(formatRetentionPeriod("1 mon")).toBe("1 month");
  });

  test("leaves the already-readable periods alone", () => {
    expect(formatRetentionPeriod("2 years")).toBe("2 years");
    expect(formatRetentionPeriod("3 years")).toBe("3 years");
    expect(formatRetentionPeriod("7 days")).toBe("7 days");
  });

  test("keeps singulars singular", () => {
    expect(formatRetentionPeriod("1 year")).toBe("1 year");
    expect(formatRetentionPeriod("1 day")).toBe("1 day");
  });

  test("reads a compound interval as a sentence", () => {
    expect(formatRetentionPeriod("1 year 6 mons")).toBe("1 year and 6 months");
  });

  // A board amending a period to something this doesn't parse should see the
  // raw value, not a blank where the retention period used to be.
  test("falls back to the raw value rather than rendering nothing", () => {
    expect(formatRetentionPeriod("00:15:00")).toBe("00:15:00");
    expect(formatRetentionPeriod("")).toBe("");
  });
});
