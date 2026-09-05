// Integration test: exercises getFinancialSummary's cash position/income
// figures (issue #498 dashboard follow-up) against a real local Supabase
// stack. These go through the get_finance_report_data RPC rather than raw
// table queries (see loadFinanceReportData in queries.ts), so seed data and
// other tests' fixtures already contribute rows -- assertions compare
// against a baseline summary taken before the fixture insert rather than
// expecting absolute totals.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, test } from "bun:test";
import {
  adminClient,
  createMonetaryDonation,
} from "../../../../../test/integration-setup";
import { getFinancialSummary } from "./queries";
import {
  DEFAULT_FISCAL_YEAR_START_MONTH,
  fiscalYearToDateRange,
} from "@/lib/fiscal-year";

function summary() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  // The dashboard's "this year" figures are fiscal-year-to-date, so mirror the
  // page rather than reimplementing a calendar year here. seed.sql pins the
  // start month to the default (July).
  const { from: startOfYear } = fiscalYearToDateRange(
    now,
    DEFAULT_FISCAL_YEAR_START_MONTH,
  );
  return getFinancialSummary(
    adminClient,
    startOfMonth.toISOString().slice(0, 10),
    startOfYear,
    now.toISOString(),
  );
}

describe("getFinancialSummary (integration)", () => {
  test("counts a monetary donation received this month toward monthly/yearly income and cash position", async () => {
    const before = await summary();

    const donation = await createMonetaryDonation({ amount: 40 });

    const after = await summary();
    expect(after.incomeThisMonth).toBeCloseTo(before.incomeThisMonth + 40, 5);
    expect(after.incomeThisYear).toBeCloseTo(before.incomeThisYear + 40, 5);
    expect(after.cashPositionTotal).toBeCloseTo(
      before.cashPositionTotal + 40,
      5,
    );

    await donation.cleanup();
  });

  test("does not count a monetary donation received a year ago toward this month's or this fiscal year's income", async () => {
    const before = await summary();

    const lastYear = new Date();
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    const donation = await createMonetaryDonation({
      amount: 60,
      receivedDate: lastYear.toISOString().slice(0, 10),
    });

    const after = await summary();
    expect(after.incomeThisMonth).toBeCloseTo(before.incomeThisMonth, 5);
    expect(after.incomeThisYear).toBeCloseTo(before.incomeThisYear, 5);
    // Cash position is all-time, so a prior-fiscal-year gift still counts.
    expect(after.cashPositionTotal).toBeCloseTo(
      before.cashPositionTotal + 60,
      5,
    );

    await donation.cleanup();
  });
});
