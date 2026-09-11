// Integration test: exercises getFinancialSummary's cash position/income
// figures (issue #498 dashboard follow-up) against a real local Supabase
// stack. These go through the get_finance_report_data RPC rather than raw
// table queries (see loadFinanceReportData in queries.ts), so seed data and
// other tests' fixtures already contribute rows -- assertions compare
// against a baseline summary taken before the fixture insert rather than
// expecting absolute totals.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createMonetaryDonation,
  serviceRoleClient,
  signInAs,
  unprivilegedActors,
} from "../../../../../test/integration-setup";
import { getFinancialSummary } from "./queries";
import {
  DEFAULT_FISCAL_YEAR_START_MONTH,
  fiscalYearToDateRange,
} from "@/lib/fiscal-year";

function summaryFor(client: SupabaseClient) {
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
    client,
    startOfMonth.toISOString().slice(0, 10),
    startOfYear,
    now.toISOString(),
  );
}

function summary() {
  return summaryFor(adminClient);
}

// A catalog of this file's own rather than a seeded variant, so the stock
// figures seed-shape.integration.test.ts pins are left exactly as they were.
// `sales` has no insert or delete grant for authenticated by design, so the
// sale goes in through `record_product_sale` and comes back out through
// service_role.
const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);
const SALE_PRICE = 37.25;

const { data: product, error: productError } = await adminClient
  .from("products")
  .insert({ name: `Dashboard IT Product ${run}` })
  .select("id")
  .single();
if (productError) throw productError;

const { data: variant, error: variantError } = await adminClient
  .from("product_variants")
  .insert({
    product_id: product.id,
    label: "One size",
    price: SALE_PRICE,
    stock_on_hand: 10,
    is_active: true,
  })
  .select("id")
  .single();
if (variantError) throw variantError;
const variantId = variant.id as string;
const productId = product.id as string;

const soldIds: string[] = [];

async function sell(): Promise<string> {
  const { data, error } = await adminClient
    .rpc("record_product_sale", {
      p_event_id: null,
      p_purchaser_person_id: null,
      p_payment_method: "cash",
      p_discount_amount: 0,
      p_sold_at: null,
      p_notes: `Dashboard IT sale ${run}`,
      p_lines: [{ variant_id: variantId, quantity: 1 }],
    })
    .single();
  if (error) throw error;
  const saleId = (data as { sale_id: string }).sale_id;
  soldIds.push(saleId);
  return saleId;
}

afterAll(async () => {
  for (const saleId of soldIds) {
    await service.from("sale_line_items").delete().eq("sale_id", saleId);
    await service.from("sales").delete().eq("id", saleId);
  }
  await service.from("products").delete().eq("id", productId);
});

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

  // #909: the Revenue tile and the cash position derive merchandise income
  // from the register, so a sale has to move them exactly the way an
  // event_revenue row does -- and a voided one has to move nothing.
  test("counts a completed sale toward revenue, income and cash position", async () => {
    const before = await summary();

    await sell();

    const after = await summary();
    expect(after.revenueThisMonth).toBeCloseTo(
      before.revenueThisMonth + SALE_PRICE,
      5,
    );
    expect(after.revenueThisYear).toBeCloseTo(
      before.revenueThisYear + SALE_PRICE,
      5,
    );
    expect(after.incomeThisMonth).toBeCloseTo(
      before.incomeThisMonth + SALE_PRICE,
      5,
    );
    expect(after.cashPositionTotal).toBeCloseTo(
      before.cashPositionTotal + SALE_PRICE,
      5,
    );
  });

  test("stops counting a sale once it is voided", async () => {
    const saleId = await sell();
    const withSale = await summary();

    const { error } = await adminClient.rpc("void_product_sale", {
      p_sale_id: saleId,
      p_reason: "Dashboard integration test",
    });
    if (error) throw error;

    const after = await summary();
    expect(after.revenueThisMonth).toBeCloseTo(
      withSale.revenueThisMonth - SALE_PRICE,
      5,
    );
    expect(after.incomeThisMonth).toBeCloseTo(
      withSale.incomeThisMonth - SALE_PRICE,
      5,
    );
    expect(after.cashPositionTotal).toBeCloseTo(
      withSale.cashPositionTotal - SALE_PRICE,
      5,
    );
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

// getFinancialSummary carries no checkPermission of its own -- the dashboard
// gates the whole Financial section on finance:manage/finance_reports:view
// (home/page.tsx) and the query trusts RLS for everything below that. These
// cases are the other half of that contract (#746): if RLS on event_expenses,
// event_revenue, reimbursements or get_finance_report_data ever loosened, a
// volunteer or a deactivated member would read real money figures and every
// test above -- all of which run as admin -- would still pass.
describe("getFinancialSummary for unprivileged actors (integration)", () => {
  test("hands every money figure back as zero, not a privileged total", async () => {
    // A gift of its own, so the privileged figures are provably non-zero and
    // the zeros below can't be a vacuously empty database.
    const donation = await createMonetaryDonation({ amount: 125 });
    const privileged = await summary();
    expect(privileged.cashPositionTotal).toBeGreaterThan(0);
    expect(privileged.incomeThisYear).toBeGreaterThan(0);
    expect(privileged.outstandingReimbursementTotal).toBeGreaterThan(0);
    expect(privileged.expensesThisYear).toBeGreaterThan(0);
    expect(privileged.revenueThisYear).toBeGreaterThan(0);

    for (const { name, client } of await unprivilegedActors()) {
      const { eventBudgetTotal, ...money } = await summaryFor(client);
      // Compared as one object, with the actor folded in, so a failure names
      // which session leaked rather than just which figure.
      expect({ actor: name, ...money }).toEqual({
        actor: name,
        expensesThisMonth: 0,
        expensesThisYear: 0,
        revenueThisMonth: 0,
        revenueThisYear: 0,
        outstandingReimbursementTotal: 0,
        cashPositionTotal: 0,
        incomeThisMonth: 0,
        incomeThisYear: 0,
      });
      // eventBudgetTotal is deliberately events:view-scoped, not finance-
      // scoped -- covered on its own below.
      expect(typeof eventBudgetTotal).toBe("number");
    }

    await donation.cleanup();
  });

  // The one figure in this summary that is deliberately not finance-scoped:
  // the dashboard renders the event-budget tile behind canSeeEventBudgets,
  // which is just events:view (home/page.tsx), and `events` RLS matches.
  // Pinned rather than endorsed -- narrowing either side should fail here and
  // be updated on purpose.
  test("event budget total follows events:view, so volunteer sees it and a no-role account does not", async () => {
    const volunteer = await summaryFor(await signInAs(SEEDED_USERS.volunteer));
    expect(volunteer.eventBudgetTotal).toBe((await summary()).eventBudgetTotal);
    // ...and it is still the only figure that crosses over.
    expect(volunteer.cashPositionTotal).toBe(0);

    const noRole = await summaryFor(await signInAs(SEEDED_USERS.noAccess));
    expect(noRole.eventBudgetTotal).toBe(0);
  });
});
