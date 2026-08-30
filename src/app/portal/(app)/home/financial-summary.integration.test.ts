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

function summary() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  return getFinancialSummary(
    adminClient,
    startOfMonth.toISOString().slice(0, 10),
    startOfYear.toISOString().slice(0, 10),
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

  test("does not count a monetary donation received last year toward this month's or this year's income", async () => {
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
    // Cash position is all-time, so a prior-year gift still counts toward it.
    expect(after.cashPositionTotal).toBeCloseTo(
      before.cashPositionTotal + 60,
      5,
    );

    await donation.cleanup();
  });
});
