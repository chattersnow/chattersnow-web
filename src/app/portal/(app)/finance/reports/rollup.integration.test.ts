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
  signInAs,
} from "../../../../../../test/integration-setup";

// Every fixture row carries a unique amount, so assertions can find it inside
// a payload that also holds whatever supabase/seed.sql put in the period.
function uniqueAmount() {
  return Number((9000 + Math.random() * 900).toFixed(2));
}

const IN_RANGE_DATE = "2026-03-15";
const IN_RANGE = { p_from: "2026-03-01", p_to: "2026-03-31" };
const OUT_OF_RANGE = { p_from: "2026-04-01", p_to: "2026-04-30" };
const today = new Date().toISOString().slice(0, 10);
const TODAY_RANGE = { p_from: today, p_to: today };

type ReportPayload = {
  revenue: { amount: string | number }[];
  expenses: { amount: string | number; status: string }[];
  reimbursements: { amount: string | number; status: string }[];
  in_kind_items: { face_value: string | number | null }[];
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

const event = await createPublishedEvent();
const person = await createPerson();

const revenueId = await insertFixture("event_revenue", {
  event_id: event.id,
  source: "ticket_sales",
  amount: revenueAmount,
  received_date: IN_RANGE_DATE,
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

afterAll(async () => {
  // Ordered by dependency: the reimbursement references the person, and both
  // the revenue and expense rows reference the event.
  await adminClient.from("reimbursements").delete().eq("id", reimbursementId);
  await person.cleanup();
  await adminClient.from("event_revenue").delete().eq("id", revenueId);
  await adminClient.from("event_expenses").delete().eq("id", expenseId);
  await event.cleanup();
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
    expect(boardPayload).toEqual(adminPayload);
    expect(amounts(boardPayload.revenue)).toContain(revenueAmount);
    expect(amounts(boardPayload.expenses)).toContain(expenseAmount);
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
