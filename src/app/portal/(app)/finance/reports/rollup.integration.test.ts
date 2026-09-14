// Integration test: exercises the real get_finance_report_data RPC
// (20260828010000_create_finance_report_rollup_rpc.sql) against a real local
// Supabase stack, so the seeded role matrix and the function's own
// finance_reports:view check decide each outcome rather than a mock.
//
// The point of the security definer there is board: it holds
// finance_reports:view and nothing else in Finance or Events, so the
// "board sees exactly what admin sees" case below is what stops this report
// from silently regressing to a zeroed page for its main oversight audience.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createPerson,
  createPublishedEvent,
  serviceRoleClient,
  signInAs,
  TENANT_TIME_ZONE,
  tenantToday,
} from "../../../../../../test/integration-setup";

// Every fixture row carries a unique amount, so assertions can find it inside
// a payload that also holds whatever supabase/seed.sql put in the period.
function uniqueAmount() {
  return Number((9000 + Math.random() * 900).toFixed(2));
}

const IN_RANGE_DATE = "2026-03-15";
const EARLIER_IN_RANGE_DATE = "2026-03-05";
const IN_RANGE = { p_from: "2026-03-01", p_to: "2026-03-31" };
const OUT_OF_RANGE = { p_from: "2026-04-01", p_to: "2026-04-30" };

// The reporting zone this file pins the tenant to below (#1065). Every day
// this file talks about is a day in it, including "today" -- taking that off
// `new Date().toISOString()` made the run fail between 6pm and midnight
// Mountain, which is exactly the defect under test.
const ORG_ZONE = TENANT_TIME_ZONE;
const today = tenantToday();
const TODAY_RANGE = { p_from: today, p_to: today };

// 7pm on 31 March in Denver, which UTC calls 1 April: the instant that tells
// the two possible answers apart. It belongs in the March report.
const LAST_EVENING_OF_MARCH = "2026-04-01T01:00:00Z";

type ReportPayload = {
  revenue: { amount: string | number }[];
  expenses: { amount: string | number; status: string }[];
  reimbursements: { amount: string | number; status: string }[];
  in_kind_items: { face_value: string | number | null }[];
  monetary_donations: {
    amount: string | number;
    donor_name: string | null;
  }[];
  sales: {
    amount: string | number;
    sold_at: string;
    event_id: string | null;
    event_name: string | null;
  }[];
};

async function report(
  client: SupabaseClient,
  range: { p_from: string; p_to: string },
) {
  const { data, error } = await client.rpc("get_finance_report_data", range);
  if (error) throw error;
  return data as ReportPayload;
}

function amounts(rows: { amount: string | number }[]) {
  return rows.map((row) => Number(row.amount));
}

async function insertFixture(
  table: string,
  row: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await adminClient
    .from(table)
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

const revenueAmount = uniqueAmount();
const expenseAmount = uniqueAmount();
const reimbursementAmount = uniqueAmount();
const donationAmount = uniqueAmount();

// Pin the tenant's reporting zone rather than leaning on what the migration
// inferred from the seeded events: the boundary cases below only mean anything
// against a known zone, and a seed change should not quietly turn them into
// tautologies. Restored in afterAll.
const { data: previousZoneRow } = await adminClient
  .from("app_settings")
  .select("value")
  .eq("key", "org.timezone")
  .maybeSingle();
const previousZone = previousZoneRow?.value ?? null;
const { error: zoneError } = await adminClient
  .from("app_settings")
  .update({ value: ORG_ZONE })
  .eq("key", "org.timezone");
if (zoneError) throw zoneError;

const event = await createPublishedEvent();
const person = await createPerson();

const revenueId = await insertFixture("event_revenue", {
  event_id: event.id,
  source: "ticket_sales",
  amount: revenueAmount,
  received_date: IN_RANGE_DATE,
});

// Inserted after the row above but dated before it, so the ordering test
// below fails if the RPC ever goes back to returning rows in whatever order
// the planner produces.
const earlierRevenueAmount = uniqueAmount();
const earlierRevenueId = await insertFixture("event_revenue", {
  event_id: event.id,
  source: "ticket_sales",
  amount: earlierRevenueAmount,
  received_date: EARLIER_IN_RANGE_DATE,
});

const expenseId = await insertFixture("event_expenses", {
  event_id: event.id,
  description: `Integration test expense ${crypto.randomUUID()}`,
  expense_date: IN_RANGE_DATE,
  amount: expenseAmount,
  currency: "USD",
});

// reimbursements has no expense-date column, so the RPC buckets rows by
// created_at -- which is now, hence TODAY_RANGE rather than IN_RANGE below.
const reimbursementId = await insertFixture("reimbursements", {
  person_id: person.id,
  description: `Integration test reimbursement ${crypto.randomUUID()}`,
  amount: reimbursementAmount,
});

// The same instant on the reimbursement side. `created_at` is the only date
// this table has (20260826000000), so it is what the rollup buckets by, and
// this row is the one that moves between February-style and March-style
// answers. Set explicitly rather than defaulted to now().
const boundaryReimbursementAmount = uniqueAmount();
const boundaryReimbursementId = await insertFixture("reimbursements", {
  person_id: person.id,
  description: `Integration test boundary reimbursement ${crypto.randomUUID()}`,
  amount: boundaryReimbursementAmount,
  created_at: LAST_EVENING_OF_MARCH,
});

const donationId = await insertFixture("monetary_donations", {
  donor_id: person.id,
  amount: donationAmount,
  method: "check",
  received_date: IN_RANGE_DATE,
});

// Sales (#909) are the one rollup input with no insert grant at all: the only
// way one exists is `record_product_sale`. So this file builds a tiny catalog
// of its own -- three variants at three unique prices, so each sale below is
// identifiable by its total inside a payload that also holds the seed's --
// and sells through the real RPC rather than inserting rows.
const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);

const inRangeSaleAmount = uniqueAmount();
const voidedSaleAmount = uniqueAmount();
const outOfRangeSaleAmount = uniqueAmount();
const boundarySaleAmount = uniqueAmount();

const { data: saleProduct, error: saleProductError } = await adminClient
  .from("products")
  .insert({ name: `Rollup IT Product ${run}` })
  .select("id")
  .single();
if (saleProductError) throw saleProductError;

const { data: saleVariants, error: saleVariantError } = await adminClient
  .from("product_variants")
  .insert(
    [
      inRangeSaleAmount,
      voidedSaleAmount,
      outOfRangeSaleAmount,
      boundarySaleAmount,
    ].map((price, index) => ({
      product_id: saleProduct.id,
      label: `Rollup ${index}`,
      price,
      stock_on_hand: 5,
      is_active: true,
    })),
  )
  .select("id, price");
if (saleVariantError) throw saleVariantError;

const variantIdForPrice = new Map(
  (saleVariants as { id: string; price: string | number }[]).map((variant) => [
    Number(variant.price),
    variant.id,
  ]),
);

async function sell(price: number, soldAt: string): Promise<string> {
  const { data, error } = await adminClient
    .rpc("record_product_sale", {
      p_event_id: event.id,
      p_purchaser_person_id: null,
      p_payment_method: "cash",
      p_discount_amount: 0,
      p_sold_at: soldAt,
      p_notes: `Rollup IT sale ${run}`,
      p_lines: [{ variant_id: variantIdForPrice.get(price), quantity: 1 }],
    })
    .single();
  if (error) throw error;
  return (data as { sale_id: string }).sale_id;
}

const inRangeSaleId = await sell(
  inRangeSaleAmount,
  `${IN_RANGE_DATE}T18:00:00Z`,
);
const outOfRangeSaleId = await sell(
  outOfRangeSaleAmount,
  "2026-04-15T18:00:00Z",
);
const boundarySaleId = await sell(boundarySaleAmount, LAST_EVENING_OF_MARCH);
const voidedSaleId = await sell(voidedSaleAmount, `${IN_RANGE_DATE}T19:00:00Z`);
const { error: voidError } = await adminClient.rpc("void_product_sale", {
  p_sale_id: voidedSaleId,
  p_reason: "Rollup integration test",
});
if (voidError) throw voidError;

function saleAmounts(payload: ReportPayload) {
  return payload.sales.map((row) => Number(row.amount));
}

afterAll(async () => {
  // `sales` has no delete grant for authenticated by design, so the catalog
  // this file created is taken back out through service_role.
  for (const saleId of [
    inRangeSaleId,
    outOfRangeSaleId,
    boundarySaleId,
    voidedSaleId,
  ]) {
    await service.from("sale_line_items").delete().eq("sale_id", saleId);
    await service.from("sales").delete().eq("id", saleId);
  }
  await service.from("products").delete().eq("id", saleProduct.id);

  // Ordered by dependency: the reimbursement and donation reference the
  // person, and both the revenue and expense rows reference the event.
  await adminClient.from("reimbursements").delete().eq("id", reimbursementId);
  await adminClient
    .from("reimbursements")
    .delete()
    .eq("id", boundaryReimbursementId);
  await adminClient.from("monetary_donations").delete().eq("id", donationId);
  await person.cleanup();
  await adminClient.from("event_revenue").delete().eq("id", revenueId);
  await adminClient.from("event_revenue").delete().eq("id", earlierRevenueId);
  await adminClient.from("event_expenses").delete().eq("id", expenseId);
  await event.cleanup();

  if (previousZone !== null) {
    await adminClient
      .from("app_settings")
      .update({ value: previousZone })
      .eq("key", "org.timezone");
  }
});

describe("get_finance_report_data access", () => {
  test("finance (finance_reports:view) can read the rollup", async () => {
    const client = await signInAs(SEEDED_USERS.finance);
    const payload = await report(client, IN_RANGE);
    expect(amounts(payload.revenue)).toContain(revenueAmount);
  });

  // The regression this RPC exists to prevent: board has no event_revenue,
  // event_expenses, or reimbursements grant, so under plain RLS this payload
  // would come back empty.
  test("board sees exactly what admin sees, despite holding no other Finance grant", async () => {
    const boardClient = await signInAs(SEEDED_USERS.board);
    const [boardPayload, adminPayload] = await Promise.all([
      report(boardClient, IN_RANGE),
      report(adminClient, IN_RANGE),
    ]);
    // Compared unsorted: every array in the payload is ordered by date then
    // id (20260907130000), so two callers reading the same period get the
    // same rows in the same order.
    expect(boardPayload).toEqual(adminPayload);
    expect(amounts(boardPayload.revenue)).toContain(revenueAmount);
    expect(amounts(boardPayload.expenses)).toContain(expenseAmount);
    expect(amounts(boardPayload.monetary_donations)).toContain(donationAmount);
    // board holds finance_reports:view and not sales:view, so this is the
    // case that proves the rollup's single gate covers the new key too.
    expect(saleAmounts(boardPayload)).toContain(inRangeSaleAmount);
  });

  test.each([
    ["event coordinator", SEEDED_USERS.coordinator],
    ["volunteer", SEEDED_USERS.volunteer],
    ["a signed-in user with no role", SEEDED_USERS.noAccess],
  ])("%s is rejected", async (_label, email) => {
    const client = await signInAs(email);
    const { error } = await client.rpc("get_finance_report_data", IN_RANGE);
    expect(error?.message).toContain("Not authorized");
  });
});

describe("get_finance_report_data row order", () => {
  // #757: the arrays used to come back in planner order, so the same report
  // could list its rows differently on two consecutive loads.
  test("orders revenue by received date, not insertion order", async () => {
    const payload = await report(adminClient, IN_RANGE);
    const rows = amounts(payload.revenue);
    const earlier = rows.indexOf(earlierRevenueAmount);
    const later = rows.indexOf(revenueAmount);
    expect(earlier).toBeGreaterThanOrEqual(0);
    expect(later).toBeGreaterThanOrEqual(0);
    expect(earlier).toBeLessThan(later);
  });

  test("returns the same order on two consecutive calls", async () => {
    const first = await report(adminClient, IN_RANGE);
    const second = await report(adminClient, IN_RANGE);
    expect(second).toEqual(first);
  });
});

describe("get_finance_report_data period filtering", () => {
  test("includes revenue and expenses dated inside the range", async () => {
    const payload = await report(adminClient, IN_RANGE);
    expect(amounts(payload.revenue)).toContain(revenueAmount);
    expect(amounts(payload.expenses)).toContain(expenseAmount);
  });

  test("excludes revenue and expenses dated outside the range", async () => {
    const payload = await report(adminClient, OUT_OF_RANGE);
    expect(amounts(payload.revenue)).not.toContain(revenueAmount);
    expect(amounts(payload.expenses)).not.toContain(expenseAmount);
  });

  test("buckets monetary donations by received date and carries the donor name", async () => {
    const [marchPayload, aprilPayload] = await Promise.all([
      report(adminClient, IN_RANGE),
      report(adminClient, OUT_OF_RANGE),
    ]);
    const donation = marchPayload.monetary_donations.find(
      (row) => Number(row.amount) === donationAmount,
    );
    expect(donation).toBeDefined();
    expect(donation?.donor_name).toBeTruthy();
    expect(amounts(aprilPayload.monetary_donations)).not.toContain(
      donationAmount,
    );
  });

  test("buckets reimbursements by the date the request was recorded", async () => {
    const [todayPayload, marchPayload] = await Promise.all([
      report(adminClient, TODAY_RANGE),
      report(adminClient, IN_RANGE),
    ]);
    expect(amounts(todayPayload.reimbursements)).toContain(reimbursementAmount);
    expect(amounts(marchPayload.reimbursements)).not.toContain(
      reimbursementAmount,
    );
  });

  // #909: merchandise income is derived from the register, so the rollup has
  // to agree with the ledger about which sales are money -- completed ones,
  // in the period, and nothing else.
  test("includes a completed sale rung up inside the range, with its event", async () => {
    const payload = await report(adminClient, IN_RANGE);
    const sale = payload.sales.find(
      (row) => Number(row.amount) === inRangeSaleAmount,
    );
    expect(sale).toBeDefined();
    expect(sale?.event_id).toBe(event.id);
    expect(sale?.event_name).toBe(event.name);
  });

  test("excludes a voided sale, whose stock went back", async () => {
    const payload = await report(adminClient, IN_RANGE);
    expect(saleAmounts(payload)).not.toContain(voidedSaleAmount);
  });

  test("buckets sales by the date they were rung up", async () => {
    const [marchPayload, aprilPayload] = await Promise.all([
      report(adminClient, IN_RANGE),
      report(adminClient, OUT_OF_RANGE),
    ]);
    expect(saleAmounts(marchPayload)).not.toContain(outOfRangeSaleAmount);
    expect(saleAmounts(aprilPayload)).toContain(outOfRangeSaleAmount);
    expect(saleAmounts(aprilPayload)).not.toContain(inRangeSaleAmount);
  });

  // #1065: the case that tells a UTC reporting day from a tenant-local one. A
  // sale rung and a reimbursement filed at 7pm on 31 March in Denver are
  // stored as 1 April in UTC; under the old `::date` cast both fell into the
  // April report and March was short an evening.
  test("counts an instant late on the last evening of the month in that month", async () => {
    const [marchPayload, aprilPayload] = await Promise.all([
      report(adminClient, IN_RANGE),
      report(adminClient, OUT_OF_RANGE),
    ]);

    expect(saleAmounts(marchPayload)).toContain(boundarySaleAmount);
    expect(saleAmounts(aprilPayload)).not.toContain(boundarySaleAmount);

    expect(amounts(marchPayload.reimbursements)).toContain(
      boundaryReimbursementAmount,
    );
    expect(amounts(aprilPayload.reimbursements)).not.toContain(
      boundaryReimbursementAmount,
    );
  });

  test("moves that same instant into April when the tenant is in UTC", async () => {
    // The proof that the zone is what decides it, rather than some other
    // property of the row. Restored before the assertions that follow.
    await adminClient
      .from("app_settings")
      .update({ value: "UTC" })
      .eq("key", "org.timezone");

    try {
      const [marchPayload, aprilPayload] = await Promise.all([
        report(adminClient, IN_RANGE),
        report(adminClient, OUT_OF_RANGE),
      ]);
      expect(saleAmounts(marchPayload)).not.toContain(boundarySaleAmount);
      expect(saleAmounts(aprilPayload)).toContain(boundarySaleAmount);
    } finally {
      await adminClient
        .from("app_settings")
        .update({ value: ORG_ZONE })
        .eq("key", "org.timezone");
    }
  });

  test("returns empty arrays rather than nulls for a period with nothing in it", async () => {
    const payload = await report(adminClient, {
      p_from: "1999-01-01",
      p_to: "1999-01-31",
    });
    expect(payload).toEqual({
      revenue: [],
      expenses: [],
      reimbursements: [],
      in_kind_items: [],
      monetary_donations: [],
      sales: [],
    });
  });

  test("rejects an inverted range", async () => {
    const { error } = await adminClient.rpc("get_finance_report_data", {
      p_from: "2026-03-31",
      p_to: "2026-03-01",
    });
    expect(error?.message).toContain("must not be after");
  });

  test("rejects a missing date", async () => {
    const { error } = await adminClient.rpc("get_finance_report_data", {
      p_from: "2026-03-01",
      p_to: null,
    });
    expect(error?.message).toContain("required");
  });
});
