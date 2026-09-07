import { describe, expect, test } from "bun:test";
import {
  DEFAULT_FISCAL_YEAR_START_MONTH,
  describeFiscalYearSpan,
  fiscalYearForDate,
  fiscalYearOptions,
  fiscalYearRange,
  fiscalYearToDateRange,
  formatFiscalYearLabel,
  isFiscalYearStartMonth,
} from "./fiscal-year";

const JULY = 7;
const JANUARY = 1;

describe("fiscalYearForDate", () => {
  test("a July start names the year for the calendar year it ends in", () => {
    // Aug 2026 is in the year that ends Jun 30 2027, so FY2027.
    expect(fiscalYearForDate(new Date("2026-08-15T00:00:00Z"), JULY)).toBe(
      2027,
    );
    // Mar 2027 is in the same fiscal year, despite the calendar year turning.
    expect(fiscalYearForDate(new Date("2027-03-15T00:00:00Z"), JULY)).toBe(
      2027,
    );
  });

  test("straddles the winter season without splitting it", () => {
    // The whole point: a 2026-27 season sits in one fiscal year.
    const seasonStart = fiscalYearForDate(
      new Date("2026-12-01T00:00:00Z"),
      JULY,
    );
    const seasonEnd = fiscalYearForDate(new Date("2027-03-01T00:00:00Z"), JULY);
    expect(seasonStart).toBe(seasonEnd);
  });

  test("handles the June 30 / July 1 boundary", () => {
    expect(fiscalYearForDate(new Date("2027-06-30T23:59:59Z"), JULY)).toBe(
      2027,
    );
    expect(fiscalYearForDate(new Date("2027-07-01T00:00:00Z"), JULY)).toBe(
      2028,
    );
  });

  test("a January start is the calendar year, preserving the old behavior", () => {
    expect(fiscalYearForDate(new Date("2026-01-01T00:00:00Z"), JANUARY)).toBe(
      2026,
    );
    expect(fiscalYearForDate(new Date("2026-08-15T00:00:00Z"), JANUARY)).toBe(
      2026,
    );
    expect(fiscalYearForDate(new Date("2026-12-31T23:59:59Z"), JANUARY)).toBe(
      2026,
    );
  });
});

describe("fiscalYearRange", () => {
  test("a July start runs Jul 1 to Jun 30 of the named year", () => {
    expect(fiscalYearRange(2027, JULY)).toEqual({
      from: "2026-07-01",
      to: "2027-06-30",
    });
  });

  test("a January start is the calendar year", () => {
    expect(fiscalYearRange(2027, JANUARY)).toEqual({
      from: "2027-01-01",
      to: "2027-12-31",
    });
  });

  test("the end bound is leap-year correct", () => {
    // A March start ends on the last day of February -- 29th in a leap year.
    expect(fiscalYearRange(2028, 3).to).toBe("2028-02-29");
    expect(fiscalYearRange(2027, 3).to).toBe("2027-02-28");
  });

  test("consecutive fiscal years meet without a gap or an overlap", () => {
    const previous = fiscalYearRange(2026, JULY);
    const next = fiscalYearRange(2027, JULY);
    expect(previous.to).toBe("2026-06-30");
    expect(next.from).toBe("2026-07-01");
  });
});

describe("fiscalYearToDateRange", () => {
  test("runs from the fiscal year start to today", () => {
    expect(
      fiscalYearToDateRange(new Date("2026-08-28T12:00:00Z"), JULY),
    ).toEqual({
      from: "2026-07-01",
      to: "2026-08-28",
    });
  });

  test("does not reach back past the fiscal year start in the new calendar year", () => {
    // Mid-January is 6 months into FY2027, not 2 weeks into a calendar year.
    expect(
      fiscalYearToDateRange(new Date("2027-01-14T12:00:00Z"), JULY),
    ).toEqual({
      from: "2026-07-01",
      to: "2027-01-14",
    });
  });

  test("on the first day of the fiscal year the range is that single day", () => {
    expect(
      fiscalYearToDateRange(new Date("2026-07-01T00:00:00Z"), JULY),
    ).toEqual({
      from: "2026-07-01",
      to: "2026-07-01",
    });
  });

  test("a January start reproduces the calendar year-to-date it replaced", () => {
    expect(
      fiscalYearToDateRange(new Date("2026-08-28T12:00:00Z"), JANUARY),
    ).toEqual({
      from: "2026-01-01",
      to: "2026-08-28",
    });
    expect(
      fiscalYearToDateRange(new Date("2026-01-01T00:00:00Z"), JANUARY),
    ).toEqual({
      from: "2026-01-01",
      to: "2026-01-01",
    });
  });

  test("never returns an inverted range near midnight UTC", () => {
    const { from, to } = fiscalYearToDateRange(
      new Date("2026-07-01T23:59:59.999Z"),
      JULY,
    );
    expect(from <= to).toBe(true);
  });
});

describe("formatFiscalYearLabel", () => {
  test("names the year it ends in", () => {
    expect(formatFiscalYearLabel(2027)).toBe("FY2027");
  });
});

describe("describeFiscalYearSpan", () => {
  test("describes the months the year covers", () => {
    expect(describeFiscalYearSpan(JULY)).toBe("July 1 – June 30");
    expect(describeFiscalYearSpan(JANUARY)).toBe("January 1 – December 31");
    expect(describeFiscalYearSpan(3)).toBe("March 1 – February 28");
  });
});

describe("fiscalYearOptions", () => {
  test("lists one year ahead and four behind, newest first", () => {
    expect(fiscalYearOptions(new Date("2026-08-15T00:00:00Z"), JULY)).toEqual([
      2028, 2027, 2026, 2025, 2024, 2023,
    ]);
  });

  test("respects an explicit window", () => {
    expect(
      fiscalYearOptions(new Date("2026-08-15T00:00:00Z"), JULY, {
        back: 1,
        forward: 0,
      }),
    ).toEqual([2027, 2026]);
  });
});

describe("isFiscalYearStartMonth", () => {
  test("accepts 1 through 12 only", () => {
    expect(isFiscalYearStartMonth(1)).toBe(true);
    expect(isFiscalYearStartMonth(12)).toBe(true);
    expect(isFiscalYearStartMonth(0)).toBe(false);
    expect(isFiscalYearStartMonth(13)).toBe(false);
    expect(isFiscalYearStartMonth(7.5)).toBe(false);
    expect(isFiscalYearStartMonth("7")).toBe(false);
    expect(isFiscalYearStartMonth(null)).toBe(false);
    expect(isFiscalYearStartMonth(undefined)).toBe(false);
  });

  test("the default is a valid start month", () => {
    expect(isFiscalYearStartMonth(DEFAULT_FISCAL_YEAR_START_MONTH)).toBe(true);
  });
});
