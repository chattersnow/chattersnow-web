// Integration test: exercises the real approveReimbursementAction against a
// real local Supabase stack (checkAnyPermission, then the approve_reimbursement
// RPC, which does the real self-vs-other-approver + threshold logic). Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPerson,
  signIn,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

// admin.ts imports "server-only", which throws outside Next's bundler --
// stub it so this plain `bun test` run can import the real module, needed
// here (unlike the other integration test files) because fixture rows must
// carry a specific `submitted_by`, which RLS otherwise pins to the inserting
// session's own auth.uid().
mock.module("server-only", () => ({}));
const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
const serviceRoleClient = createSupabaseAdminClient();

const { approveReimbursementAction, createReimbursementFromExpenseAction } =
  await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const userIdCache = new Map<string, string>();
async function userId(email: string): Promise<string> {
  const cached = userIdCache.get(email);
  if (cached) return cached;
  const { data, error } = await serviceRoleClient.auth.admin.listUsers();
  if (error) throw error;
  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error(`seeded user ${email} not found`);
  userIdCache.set(email, user.id);
  return user.id;
}

async function approvalThreshold(): Promise<number> {
  const { data, error } = await adminClient
    .from("app_settings")
    .select("value")
    .eq("key", "finance.reimbursement_approval_threshold")
    .single();
  if (error) throw error;
  return Number(data.value);
}

async function createReimbursement(overrides: {
  personId: string;
  submittedBy: string;
  amount: number;
  status?: "submitted" | "approved" | "rejected" | "paid";
}) {
  const { data, error } = await serviceRoleClient
    .from("reimbursements")
    .insert({
      person_id: overrides.personId,
      submitted_by: overrides.submittedBy,
      created_by: overrides.submittedBy,
      amount: overrides.amount,
      description: "Integration test reimbursement",
      status: overrides.status ?? "submitted",
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  return {
    id,
    // RLS only allows deleting submitted/rejected rows, but an approved
    // reimbursement is exactly what most of these tests produce -- use the
    // service-role client, which bypasses RLS, for cleanup.
    async cleanup() {
      await serviceRoleClient.from("reimbursements").delete().eq("id", id);
    },
  };
}

async function getReimbursement(id: string) {
  const { data, error } = await adminClient
    .from("reimbursements")
    .select("status, approved_by")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

async function createExpense(overrides: {
  submittedBy: string;
  amount: number;
  paidByPersonId?: string | null;
  description?: string;
}) {
  const { data, error } = await serviceRoleClient
    .from("event_expenses")
    .insert({
      description: overrides.description ?? "Integration test expense",
      expense_date: new Date().toISOString().slice(0, 10),
      amount: overrides.amount,
      currency: "USD",
      created_by: overrides.submittedBy,
      submitted_by: overrides.submittedBy,
      status: "submitted",
      paid_by_person_id: overrides.paidByPersonId ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  return {
    id,
    async cleanup() {
      await serviceRoleClient
        .from("reimbursements")
        .delete()
        .eq("source_expense_id", id);
      await serviceRoleClient.from("event_expenses").delete().eq("id", id);
    },
  };
}

async function getReimbursementBySource(expenseId: string) {
  const { data, error } = await adminClient
    .from("reimbursements")
    .select(
      "person_id, event_id, amount, description, status, source_expense_id",
    )
    .eq("source_expense_id", expenseId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

describe("approveReimbursementAction (integration)", () => {
  test("an anonymous session cannot approve a reimbursement", async () => {
    currentSupabase = anonClient();
    const result = await approveReimbursementAction(crypto.randomUUID());
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });

  test("finance can approve their own submission below the threshold", async () => {
    const threshold = await approvalThreshold();
    const financeId = await userId(SEEDED_USERS.finance);
    const person = await createPerson();
    const reimbursement = await createReimbursement({
      personId: person.id,
      submittedBy: financeId,
      amount: threshold - 1,
    });
    currentSupabase = await signIn(SEEDED_USERS.finance);

    const result = await approveReimbursementAction(reimbursement.id);
    expect(result).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/finance/reimbursements",
    );

    const row = await getReimbursement(reimbursement.id);
    expect(row.status).toBe("approved");
    expect(row.approved_by).toBe(financeId);

    await reimbursement.cleanup();
    await person.cleanup();
  });

  test("finance cannot self-approve at or above the threshold", async () => {
    const threshold = await approvalThreshold();
    const financeId = await userId(SEEDED_USERS.finance);
    const person = await createPerson();
    const reimbursement = await createReimbursement({
      personId: person.id,
      submittedBy: financeId,
      amount: threshold,
    });
    currentSupabase = await signIn(SEEDED_USERS.finance);

    const result = await approveReimbursementAction(reimbursement.id);
    expect(result).toEqual({
      error:
        "This reimbursement is at or above the approval threshold and requires a second approver",
    });

    const row = await getReimbursement(reimbursement.id);
    expect(row.status).toBe("submitted");

    await reimbursement.cleanup();
    await person.cleanup();
  });

  test("admin can approve someone else's submission", async () => {
    const financeId = await userId(SEEDED_USERS.finance);
    const adminId = await userId(SEEDED_USERS.admin);
    const person = await createPerson();
    const reimbursement = await createReimbursement({
      personId: person.id,
      submittedBy: financeId,
      amount: 50,
    });
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await approveReimbursementAction(reimbursement.id);
    expect(result).toEqual({ success: true });

    const row = await getReimbursement(reimbursement.id);
    expect(row.status).toBe("approved");
    expect(row.approved_by).toBe(adminId);

    await reimbursement.cleanup();
    await person.cleanup();
  });

  test("board can approve someone else's submission", async () => {
    const financeId = await userId(SEEDED_USERS.finance);
    const person = await createPerson();
    const reimbursement = await createReimbursement({
      personId: person.id,
      submittedBy: financeId,
      amount: 50,
    });
    currentSupabase = await signIn(SEEDED_USERS.board);

    const result = await approveReimbursementAction(reimbursement.id);
    expect(result).toEqual({ success: true });

    const row = await getReimbursement(reimbursement.id);
    expect(row.status).toBe("approved");

    await reimbursement.cleanup();
    await person.cleanup();
  });

  test("admin cannot approve their own submission", async () => {
    const adminId = await userId(SEEDED_USERS.admin);
    const person = await createPerson();
    const reimbursement = await createReimbursement({
      personId: person.id,
      submittedBy: adminId,
      amount: 50,
    });
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await approveReimbursementAction(reimbursement.id);
    expect(result).toEqual({
      error: "Not authorized to approve this reimbursement",
    });

    await reimbursement.cleanup();
    await person.cleanup();
  });

  test("event_coordinator cannot approve any reimbursement", async () => {
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    const result = await approveReimbursementAction(crypto.randomUUID());
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });

  test("volunteer cannot approve any reimbursement", async () => {
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    const result = await approveReimbursementAction(crypto.randomUUID());
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });

  test("multi (event_coordinator + volunteer) still cannot approve any reimbursement", async () => {
    currentSupabase = await signIn(SEEDED_USERS.multi);
    const result = await approveReimbursementAction(crypto.randomUUID());
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });

  test("an already-approved reimbursement cannot be approved again", async () => {
    const financeId = await userId(SEEDED_USERS.finance);
    const person = await createPerson();
    const reimbursement = await createReimbursement({
      personId: person.id,
      submittedBy: financeId,
      amount: 50,
      status: "approved",
    });
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await approveReimbursementAction(reimbursement.id);
    expect(result).toEqual({
      error: "Only submitted reimbursements can be approved",
    });

    await reimbursement.cleanup();
    await person.cleanup();
  });
});

describe("createReimbursementFromExpenseAction (integration)", () => {
  test("an anonymous session cannot create a reimbursement from an expense", async () => {
    currentSupabase = anonClient();
    const result = await createReimbursementFromExpenseAction(
      crypto.randomUUID(),
    );
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });

  test("board (no reimbursements access) cannot create a reimbursement from an expense", async () => {
    currentSupabase = await signIn(SEEDED_USERS.board);
    const result = await createReimbursementFromExpenseAction(
      crypto.randomUUID(),
    );
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });

  test("finance can create a reimbursement from a personally-fronted expense", async () => {
    const financeId = await userId(SEEDED_USERS.finance);
    const person = await createPerson();
    const expense = await createExpense({
      submittedBy: financeId,
      amount: 42.5,
      paidByPersonId: person.id,
      description: "Camp stove fuel",
    });
    currentSupabase = await signIn(SEEDED_USERS.finance);

    const result = await createReimbursementFromExpenseAction(expense.id);
    expect(result).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/finance/reimbursements",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/finance/expenses");

    const created = await getReimbursementBySource(expense.id);
    expect(created).toMatchObject({
      person_id: person.id,
      amount: 42.5,
      description: "Reimbursement for: Camp stove fuel",
      status: "submitted",
      source_expense_id: expense.id,
    });

    await expense.cleanup();
    await person.cleanup();
  });

  test("cannot create a reimbursement from an expense with no payer on file", async () => {
    const financeId = await userId(SEEDED_USERS.finance);
    const expense = await createExpense({
      submittedBy: financeId,
      amount: 20,
    });
    currentSupabase = await signIn(SEEDED_USERS.finance);

    const result = await createReimbursementFromExpenseAction(expense.id);
    expect(result).toEqual({
      error: "This expense isn't marked as personally paid.",
    });

    await expense.cleanup();
  });

  test("cannot create a second reimbursement from the same expense", async () => {
    const financeId = await userId(SEEDED_USERS.finance);
    const person = await createPerson();
    const expense = await createExpense({
      submittedBy: financeId,
      amount: 15,
      paidByPersonId: person.id,
    });
    currentSupabase = await signIn(SEEDED_USERS.finance);

    const first = await createReimbursementFromExpenseAction(expense.id);
    expect(first).toEqual({ success: true });

    const second = await createReimbursementFromExpenseAction(expense.id);
    expect(second).toEqual({
      error: "A reimbursement has already been created from this expense.",
    });

    await expense.cleanup();
    await person.cleanup();
  });
});
