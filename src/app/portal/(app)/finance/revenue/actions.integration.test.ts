// Integration test: exercises the real event_revenue Server Actions
// (createRevenueAction, updateRevenueAction, deleteRevenueAction,
// listEventRevenueAction) against a real local Supabase stack --
// checkPermission, then real `event_revenue` RLS. Unlike event_expenses,
// event_revenue has no approval workflow -- plain CRUD gated on the
// event_revenue resource (admin/event_coordinator/finance manage;
// board/volunteer none), per 20260825010000_create_event_revenue.sql. No
// integration test previously touched event_revenue at all. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  signIn,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  createRevenueAction,
  updateRevenueAction,
  deleteRevenueAction,
  listEventRevenueAction,
} = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

function revenueForm(overrides?: { source?: string; amount?: number }) {
  const fd = new FormData();
  fd.set("source", overrides?.source ?? "ticket_sales");
  fd.set("receivedDate", new Date().toISOString().slice(0, 10));
  fd.set("amount", String(overrides?.amount ?? 100));
  return fd;
}

async function cleanupRevenue(id: string) {
  await adminClient.from("event_revenue").delete().eq("id", id);
}

async function createRevenueRow(amount = 100) {
  currentSupabase = adminClient;
  const result = await createRevenueAction(revenueForm({ amount }));
  if (!("success" in result)) throw new Error(result.error);

  const { data, error } = await adminClient
    .from("event_revenue")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return { id: data.id as string, cleanup: () => cleanupRevenue(data.id) };
}

describe("createRevenueAction (integration)", () => {
  test("an anonymous session cannot create a revenue record", async () => {
    currentSupabase = anonClient();
    const result = await createRevenueAction(revenueForm());
    expect(result).toEqual(DENIED);
  });

  test("admin role (event_revenue manage) can create a revenue record", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const result = await createRevenueAction(revenueForm({ amount: 250 }));
    expect(result).toEqual({ success: true });

    const { data } = await adminClient
      .from("event_revenue")
      .select("id, amount")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(Number(data?.amount)).toBe(250);
    await cleanupRevenue(data!.id);
  });

  test("event_coordinator role (event_revenue manage) can create a revenue record", async () => {
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    const result = await createRevenueAction(revenueForm());
    expect(result).toEqual({ success: true });

    const { data } = await adminClient
      .from("event_revenue")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    await cleanupRevenue(data!.id);
  });

  test("finance role (event_revenue manage) can create a revenue record", async () => {
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const result = await createRevenueAction(revenueForm());
    expect(result).toEqual({ success: true });

    const { data } = await adminClient
      .from("event_revenue")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    await cleanupRevenue(data!.id);
  });

  test("board role (no event_revenue access) cannot create a revenue record", async () => {
    currentSupabase = await signIn(SEEDED_USERS.board);
    const result = await createRevenueAction(revenueForm());
    expect(result).toEqual(DENIED);
  });

  test("volunteer role (no event_revenue access) cannot create a revenue record", async () => {
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    const result = await createRevenueAction(revenueForm());
    expect(result).toEqual(DENIED);
  });

  test("a deactivated (former) account cannot create a revenue record", async () => {
    currentSupabase = await signIn(SEEDED_USERS.former);
    const result = await createRevenueAction(revenueForm());
    expect(result).toEqual(DENIED);
  });
});

describe("updateRevenueAction (integration)", () => {
  test("finance role can update a revenue record", async () => {
    const revenue = await createRevenueRow();
    currentSupabase = await signIn(SEEDED_USERS.finance);

    const result = await updateRevenueAction(
      revenue.id,
      revenueForm({ amount: 999 }),
    );
    expect(result).toEqual({ success: true });

    const { data } = await adminClient
      .from("event_revenue")
      .select("amount")
      .eq("id", revenue.id)
      .single();
    expect(Number(data?.amount)).toBe(999);
    await revenue.cleanup();
  });

  test("board role (no event_revenue access) cannot update a revenue record", async () => {
    const revenue = await createRevenueRow();
    currentSupabase = await signIn(SEEDED_USERS.board);

    const result = await updateRevenueAction(revenue.id, revenueForm());
    expect(result).toEqual(DENIED);
    await revenue.cleanup();
  });

  test("volunteer role (no event_revenue access) cannot update a revenue record", async () => {
    const revenue = await createRevenueRow();
    currentSupabase = await signIn(SEEDED_USERS.volunteer);

    const result = await updateRevenueAction(revenue.id, revenueForm());
    expect(result).toEqual(DENIED);
    await revenue.cleanup();
  });
});

describe("deleteRevenueAction (integration)", () => {
  test("admin role can delete a revenue record", async () => {
    const revenue = await createRevenueRow();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await deleteRevenueAction(revenue.id);
    expect(result).toEqual({ success: true });

    const { data } = await adminClient
      .from("event_revenue")
      .select("id")
      .eq("id", revenue.id)
      .maybeSingle();
    expect(data).toBeNull();
  });

  test("board role (no event_revenue access) cannot delete a revenue record", async () => {
    const revenue = await createRevenueRow();
    currentSupabase = await signIn(SEEDED_USERS.board);

    const result = await deleteRevenueAction(revenue.id);
    expect(result).toEqual(DENIED);
    await revenue.cleanup();
  });

  test("volunteer role (no event_revenue access) cannot delete a revenue record", async () => {
    const revenue = await createRevenueRow();
    currentSupabase = await signIn(SEEDED_USERS.volunteer);

    const result = await deleteRevenueAction(revenue.id);
    expect(result).toEqual(DENIED);
    await revenue.cleanup();
  });
});

describe("listEventRevenueAction (integration)", () => {
  test("an anonymous session cannot list revenue", async () => {
    currentSupabase = anonClient();
    const result = await listEventRevenueAction(crypto.randomUUID());
    expect(result).toEqual(DENIED);
  });

  test("finance role can list an event's revenue", async () => {
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const result = await listEventRevenueAction(crypto.randomUUID());
    expect("data" in result).toBe(true);
  });

  test("board role (no event_revenue access) cannot list revenue", async () => {
    currentSupabase = await signIn(SEEDED_USERS.board);
    const result = await listEventRevenueAction(crypto.randomUUID());
    expect(result).toEqual(DENIED);
  });

  test("volunteer role (no event_revenue access) cannot list revenue", async () => {
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    const result = await listEventRevenueAction(crypto.randomUUID());
    expect(result).toEqual(DENIED);
  });
});
