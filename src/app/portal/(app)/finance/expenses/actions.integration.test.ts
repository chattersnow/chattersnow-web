// Integration test: exercises the real event_expenses Server Actions
// (createExpenseAction, updateExpenseAction, listEventExpensesAction,
// approveExpenseAction, rejectExpenseAction, markExpensePaidAction) against a
// real local Supabase stack -- checkPermission/checkAnyPermission, then the
// real `event_expenses` RLS and the approve/reject/mark-paid RPCs (the
// finance_approvals/finance_self_approval two-tier approval workflow from
// 20260823050000_add_event_expense_approval_workflow.sql). No integration
// test previously touched event_expenses at all. Requires
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

// admin.ts imports "server-only", which throws outside Next's bundler --
// stub it so this plain `bun test` run can import the real module, needed
// here (unlike most other integration test files) because fixture rows must
// carry a specific `submitted_by`, which RLS otherwise pins to the inserting
// session's own auth.uid().
mock.module("server-only", () => ({}));
const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
const serviceRoleClient = createSupabaseAdminClient();

const {
  createExpenseAction,
  updateExpenseAction,
  listEventExpensesAction,
  approveExpenseAction,
  rejectExpenseAction,
  markExpensePaidAction,
} = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

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
    .eq("key", "finance.expense_approval_threshold")
    .single();
  if (error) throw error;
  return Number(data.value);
}

async function createExpense(overrides: {
  submittedBy: string;
  amount: number;
  status?: "submitted" | "approved" | "rejected" | "paid";
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
      status: overrides.status ?? "submitted",
    })
    .select("id")
    .single();
  if (error) throw error;

  const id = data.id as string;
  return {
    id,
    async cleanup() {
      await serviceRoleClient.from("event_expenses").delete().eq("id", id);
    },
  };
}

async function getExpense(id: string) {
  const { data, error } = await adminClient
    .from("event_expenses")
    .select("status, description, approved_by, rejected_at, paid_by")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

function expenseForm(overrides?: { description?: string; amount?: number }) {
  const fd = new FormData();
  fd.set("description", overrides?.description ?? "Integration test expense");
  fd.set("expenseDate", new Date().toISOString().slice(0, 10));
  fd.set("amount", String(overrides?.amount ?? 42));
  return fd;
}

describe("createExpenseAction (integration)", () => {
  test("an anonymous session cannot create an expense", async () => {
    currentSupabase = anonClient();
    const result = await createExpenseAction(expenseForm());
    expect(result).toEqual(DENIED);
  });

  test("admin role (event_expenses manage) can create an expense", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const result = await createExpenseAction(
      expenseForm({ description: "Admin expense" }),
    );
    expect(result).toEqual({ success: true });

    const { data } = await adminClient
      .from("event_expenses")
      .select("id, status, submitted_by")
      .eq("description", "Admin expense")
      .single();
    expect(data?.status).toBe("submitted");
    expect(data?.submitted_by).toBe(await userId(SEEDED_USERS.admin));
    await serviceRoleClient.from("event_expenses").delete().eq("id", data!.id);
  });

  test("event_coordinator role (event_expenses manage) can create an expense", async () => {
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    const result = await createExpenseAction(
      expenseForm({ description: "Coordinator expense" }),
    );
    expect(result).toEqual({ success: true });
    await serviceRoleClient
      .from("event_expenses")
      .delete()
      .eq("description", "Coordinator expense");
  });

  test("finance role (event_expenses manage) can create an expense", async () => {
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const result = await createExpenseAction(
      expenseForm({ description: "Finance expense" }),
    );
    expect(result).toEqual({ success: true });
    await serviceRoleClient
      .from("event_expenses")
      .delete()
      .eq("description", "Finance expense");
  });

  test("board role (no event_expenses access) cannot create an expense", async () => {
    currentSupabase = await signIn(SEEDED_USERS.board);
    const result = await createExpenseAction(expenseForm());
    expect(result).toEqual(DENIED);
  });

  test("volunteer role (no event_expenses access) cannot create an expense", async () => {
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    const result = await createExpenseAction(expenseForm());
    expect(result).toEqual(DENIED);
  });
});

describe("updateExpenseAction (integration)", () => {
  test("event_expenses:manage lets one role edit a submitted expense created by another", async () => {
    const financeId = await userId(SEEDED_USERS.finance);
    const expense = await createExpense({
      submittedBy: financeId,
      amount: 10,
    });
    currentSupabase = await signIn(SEEDED_USERS.coordinator);

    const result = await updateExpenseAction(
      expense.id,
      expenseForm({ description: "Edited by coordinator" }),
    );
    expect(result).toEqual({ success: true });

    const row = await getExpense(expense.id);
    expect(row.description).toBe("Edited by coordinator");
    await expense.cleanup();
  });

  test("board role (no event_expenses access) cannot update an expense", async () => {
    const financeId = await userId(SEEDED_USERS.finance);
    const expense = await createExpense({ submittedBy: financeId, amount: 10 });
    currentSupabase = await signIn(SEEDED_USERS.board);

    const result = await updateExpenseAction(expense.id, expenseForm());
    expect(result).toEqual(DENIED);
    await expense.cleanup();
  });

  test("an approved expense cannot be edited (RLS enforces submitted-only writes)", async () => {
    const financeId = await userId(SEEDED_USERS.finance);
    const expense = await createExpense({
      submittedBy: financeId,
      amount: 10,
      status: "approved",
      description: "Original description",
    });
    currentSupabase = await signIn(SEEDED_USERS.finance);

    await updateExpenseAction(
      expense.id,
      expenseForm({ description: "Attempted edit" }),
    );

    const row = await getExpense(expense.id);
    expect(row.description).toBe("Original description");
    await expense.cleanup();
  });
});

describe("listEventExpensesAction (integration)", () => {
  test("an anonymous session cannot list expenses", async () => {
    currentSupabase = anonClient();
    const result = await listEventExpensesAction(crypto.randomUUID());
    expect(result).toEqual(DENIED);
  });

  test("finance role (event_expenses manage) can list an event's expenses", async () => {
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const result = await listEventExpensesAction(crypto.randomUUID());
    expect("data" in result).toBe(true);
  });

  test("board role (no event_expenses access) cannot list expenses", async () => {
    currentSupabase = await signIn(SEEDED_USERS.board);
    const result = await listEventExpensesAction(crypto.randomUUID());
    expect(result).toEqual(DENIED);
  });

  test("volunteer role (no event_expenses access) cannot list expenses", async () => {
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    const result = await listEventExpensesAction(crypto.randomUUID());
    expect(result).toEqual(DENIED);
  });
});

describe("approveExpenseAction (integration)", () => {
  test("an anonymous session cannot approve an expense", async () => {
    currentSupabase = anonClient();
    const result = await approveExpenseAction(crypto.randomUUID());
    expect(result).toEqual(DENIED);
  });

  test("finance can self-approve their own submission below the threshold", async () => {
    const threshold = await approvalThreshold();
    const financeId = await userId(SEEDED_USERS.finance);
    const expense = await createExpense({
      submittedBy: financeId,
      amount: threshold - 1,
    });
    currentSupabase = await signIn(SEEDED_USERS.finance);

    const result = await approveExpenseAction(expense.id);
    expect(result).toEqual({ success: true });

    const row = await getExpense(expense.id);
    expect(row.status).toBe("approved");
    expect(row.approved_by).toBe(financeId);
    await expense.cleanup();
  });

  test("finance cannot self-approve at or above the threshold", async () => {
    const threshold = await approvalThreshold();
    const financeId = await userId(SEEDED_USERS.finance);
    const expense = await createExpense({
      submittedBy: financeId,
      amount: threshold,
    });
    currentSupabase = await signIn(SEEDED_USERS.finance);

    const result = await approveExpenseAction(expense.id);
    expect(result).toEqual({
      error:
        "This expense is at or above the approval threshold and requires a second approver",
    });

    const row = await getExpense(expense.id);
    expect(row.status).toBe("submitted");
    await expense.cleanup();
  });

  test("admin can approve someone else's submission", async () => {
    const coordinatorId = await userId(SEEDED_USERS.coordinator);
    const adminId = await userId(SEEDED_USERS.admin);
    const expense = await createExpense({
      submittedBy: coordinatorId,
      amount: 50,
    });
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await approveExpenseAction(expense.id);
    expect(result).toEqual({ success: true });

    const row = await getExpense(expense.id);
    expect(row.approved_by).toBe(adminId);
    await expense.cleanup();
  });

  test("board can approve someone else's submission", async () => {
    const coordinatorId = await userId(SEEDED_USERS.coordinator);
    const expense = await createExpense({
      submittedBy: coordinatorId,
      amount: 50,
    });
    currentSupabase = await signIn(SEEDED_USERS.board);

    const result = await approveExpenseAction(expense.id);
    expect(result).toEqual({ success: true });
    await expense.cleanup();
  });

  test("admin cannot approve their own submission (no finance_self_approval)", async () => {
    const adminId = await userId(SEEDED_USERS.admin);
    const expense = await createExpense({ submittedBy: adminId, amount: 50 });
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await approveExpenseAction(expense.id);
    expect(result).toEqual({
      error: "Not authorized to approve this expense",
    });
    await expense.cleanup();
  });

  test("event_coordinator (no finance_approvals or finance_self_approval) cannot approve any expense", async () => {
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    const result = await approveExpenseAction(crypto.randomUUID());
    expect(result).toEqual(DENIED);
  });

  test("volunteer cannot approve any expense", async () => {
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    const result = await approveExpenseAction(crypto.randomUUID());
    expect(result).toEqual(DENIED);
  });

  test("an already-approved expense cannot be approved again", async () => {
    const financeId = await userId(SEEDED_USERS.finance);
    const expense = await createExpense({
      submittedBy: financeId,
      amount: 50,
      status: "approved",
    });
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await approveExpenseAction(expense.id);
    expect(result).toEqual({
      error: "Only submitted expenses can be approved",
    });
    await expense.cleanup();
  });
});

describe("rejectExpenseAction (integration)", () => {
  test("an anonymous session cannot reject an expense", async () => {
    currentSupabase = anonClient();
    const result = await rejectExpenseAction(crypto.randomUUID(), "no reason");
    expect(result).toEqual(DENIED);
  });

  test("a rejection reason is required", async () => {
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const result = await rejectExpenseAction(crypto.randomUUID(), "  ");
    expect(result).toEqual({ error: "A rejection reason is required." });
  });

  test("admin can reject someone else's submission", async () => {
    const coordinatorId = await userId(SEEDED_USERS.coordinator);
    const expense = await createExpense({
      submittedBy: coordinatorId,
      amount: 50,
    });
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await rejectExpenseAction(expense.id, "Missing receipt");
    expect(result).toEqual({ success: true });

    const row = await getExpense(expense.id);
    expect(row.status).toBe("rejected");
    await expense.cleanup();
  });

  test("finance (no finance_approvals) cannot reject any expense", async () => {
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const result = await rejectExpenseAction(crypto.randomUUID(), "reason");
    expect(result).toEqual(DENIED);
  });

  test("admin cannot reject their own submission", async () => {
    const adminId = await userId(SEEDED_USERS.admin);
    const expense = await createExpense({ submittedBy: adminId, amount: 50 });
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await rejectExpenseAction(expense.id, "self reject");
    expect(result).toEqual({
      error: "Not authorized to reject this expense",
    });
    await expense.cleanup();
  });
});

describe("markExpensePaidAction (integration)", () => {
  test("an anonymous session cannot mark an expense paid", async () => {
    currentSupabase = anonClient();
    const result = await markExpensePaidAction(crypto.randomUUID());
    expect(result).toEqual(DENIED);
  });

  test("admin role (finance manage) can mark an approved expense paid", async () => {
    const coordinatorId = await userId(SEEDED_USERS.coordinator);
    const adminId = await userId(SEEDED_USERS.admin);
    const expense = await createExpense({
      submittedBy: coordinatorId,
      amount: 50,
      status: "approved",
    });
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const result = await markExpensePaidAction(expense.id);
    expect(result).toEqual({ success: true });

    const row = await getExpense(expense.id);
    expect(row.status).toBe("paid");
    expect(row.paid_by).toBe(adminId);
    await expense.cleanup();
  });

  test("event_coordinator role (event_expenses manage but not finance manage) cannot mark an expense paid", async () => {
    const coordinatorId = await userId(SEEDED_USERS.coordinator);
    const expense = await createExpense({
      submittedBy: coordinatorId,
      amount: 50,
      status: "approved",
    });
    currentSupabase = await signIn(SEEDED_USERS.coordinator);

    const result = await markExpensePaidAction(expense.id);
    expect(result).toEqual(DENIED);
    await expense.cleanup();
  });

  test("a still-submitted expense cannot be marked paid", async () => {
    const financeId = await userId(SEEDED_USERS.finance);
    const expense = await createExpense({
      submittedBy: financeId,
      amount: 50,
    });
    currentSupabase = await signIn(SEEDED_USERS.finance);

    const result = await markExpensePaidAction(expense.id);
    expect(result).toEqual({
      error: "Only approved expenses can be marked paid",
    });
    await expense.cleanup();
  });
});

// #748. Every approval test above acts alone, so the RPC's `status <>
// 'submitted'` guard is only ever asked about a status some earlier awaited
// call already wrote. Two approvers clearing the same queue -- the ordinary
// way a finance queue gets worked -- read `submitted` at the same moment, and
// only the row lock decides what happens next.
describe("expense approval under concurrency", () => {
  // The createSupabaseServerClient mock reads `currentSupabase` synchronously
  // (its body has no await before the read) and every action captures the
  // client in its first statement, so setting the variable immediately before
  // each call pins that call to that session -- which is what lets two
  // different approvers race through the real action rather than the RPC.
  function as<T>(client: SupabaseClient, call: () => Promise<T>): Promise<T> {
    currentSupabase = client;
    return call();
  }

  test("two approvers clearing the same queue produce one approval", async () => {
    const coordinatorId = await userId(SEEDED_USERS.coordinator);
    const expense = await createExpense({
      submittedBy: coordinatorId,
      amount: 42,
    });
    const [adminSession, boardSession] = await Promise.all([
      signIn(SEEDED_USERS.admin),
      signIn(SEEDED_USERS.board),
    ]);

    const results = await Promise.all([
      as(adminSession, () => approveExpenseAction(expense.id)),
      as(boardSession, () => approveExpenseAction(expense.id)),
    ]);

    expect(results.filter((result) => "success" in result)).toHaveLength(1);
    for (const result of results.filter((result) => "error" in result)) {
      expect(result).toEqual({
        error: "Only submitted expenses can be approved",
      });
    }

    const row = await getExpense(expense.id);
    expect(row.status).toBe("approved");
    // One approver is recorded, and it is one of the two who actually raced.
    expect([
      await userId(SEEDED_USERS.admin),
      await userId(SEEDED_USERS.board),
    ]).toContain(row.approved_by);

    await expense.cleanup();
  });

  // An approve and a reject arriving together must not leave the row in a
  // state neither approver chose, and must not record both decisions.
  test("an approval and a rejection at once settle on exactly one outcome", async () => {
    const coordinatorId = await userId(SEEDED_USERS.coordinator);
    const expense = await createExpense({
      submittedBy: coordinatorId,
      amount: 42,
    });
    const [adminSession, boardSession] = await Promise.all([
      signIn(SEEDED_USERS.admin),
      signIn(SEEDED_USERS.board),
    ]);

    const [approval, rejection] = await Promise.all([
      as(adminSession, () => approveExpenseAction(expense.id)),
      as(boardSession, () =>
        rejectExpenseAction(expense.id, "Duplicate submission"),
      ),
    ]);

    expect(
      [approval, rejection].filter((result) => "success" in result),
    ).toHaveLength(1);

    const row = await getExpense(expense.id);
    if ("success" in approval) {
      expect(row.status).toBe("approved");
      expect(row.rejected_at).toBeNull();
    } else {
      expect(row.status).toBe("rejected");
      expect(row.approved_by).toBeNull();
    }

    await expense.cleanup();
  });

  // The self-approval carve-out is a per-row threshold check, so the only way
  // concurrency could defeat it is by letting a self-approval commit beside
  // someone else's. It must still be the one refusal, whichever call wins.
  test("a self-approval over the threshold is refused even racing a real approver", async () => {
    const threshold = await approvalThreshold();
    const financeId = await userId(SEEDED_USERS.finance);
    const expense = await createExpense({
      submittedBy: financeId,
      amount: threshold,
    });
    const [financeSession, adminSession] = await Promise.all([
      signIn(SEEDED_USERS.finance),
      signIn(SEEDED_USERS.admin),
    ]);

    const [selfApproval, otherApproval] = await Promise.all([
      as(financeSession, () => approveExpenseAction(expense.id)),
      as(adminSession, () => approveExpenseAction(expense.id)),
    ]);

    // Which refusal the self-approval gets depends on who took the row lock
    // first -- the threshold when it got there first, "already settled" when
    // the admin did. Either is correct; approving its own submission is not,
    // so the assertion is on the outcome rather than on the message.
    expect(selfApproval).not.toEqual({ success: true });
    expect([
      "This expense is at or above the approval threshold and requires a second approver",
      "Only submitted expenses can be approved",
    ]).toContain((selfApproval as { error: string }).error);
    expect(otherApproval).toEqual({ success: true });

    const row = await getExpense(expense.id);
    expect(row.status).toBe("approved");
    expect(row.approved_by).toBe(await userId(SEEDED_USERS.admin));
    expect(row.approved_by).not.toBe(financeId);

    await expense.cleanup();
  });
});
