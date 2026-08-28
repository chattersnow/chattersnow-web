// Integration test: exercises count_pending_event_expense_approvals and
// count_pending_reimbursement_approvals (20260828070000, fixing
// 20260823120000/20260826000000) against a real local Supabase stack. Those
// RPCs back the portal's "N expenses/reimbursements to approve" badge
// (getPendingApprovalsSummary in ./attention-items.ts) and previously counted
// every submitted row for anyone holding finance_approvals/
// reimbursement_approvals:manage, including rows that same viewer had
// submitted themselves -- which approve_event_expense/approve_reimbursement
// never let them approve. Assertions use before/after deltas rather than
// absolute counts since other integration tests running against this stack
// may leave their own submitted rows around. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createPerson,
  signInAs,
} from "../../../test/integration-setup";

// admin.ts imports "server-only", which throws outside Next's bundler --
// stub it so this plain `bun test` run can import the real module. Needed
// here (unlike most other integration test files) because fixture rows must
// carry a `submitted_by` different from the inserting session, which RLS
// otherwise pins to that session's own auth.uid().
mock.module("server-only", () => ({}));
const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
const serviceRoleClient = createSupabaseAdminClient();

async function count(supabase: SupabaseClient, rpc: string): Promise<number> {
  const { data, error } = await supabase.rpc(rpc);
  if (error) throw error;
  return data ?? 0;
}

async function expenseApprovalThreshold(): Promise<number> {
  const { data, error } = await adminClient
    .from("app_settings")
    .select("value")
    .eq("key", "finance.expense_approval_threshold")
    .single();
  if (error) throw error;
  return Number(data.value);
}

async function reimbursementApprovalThreshold(): Promise<number> {
  const { data, error } = await adminClient
    .from("app_settings")
    .select("value")
    .eq("key", "finance.reimbursement_approval_threshold")
    .single();
  if (error) throw error;
  return Number(data.value);
}

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

async function createExpense(overrides: {
  submittedBy: string;
  amount: number;
}) {
  const { data, error } = await serviceRoleClient
    .from("event_expenses")
    .insert({
      description: "Integration test expense",
      expense_date: new Date().toISOString().slice(0, 10),
      amount: overrides.amount,
      currency: "USD",
      created_by: overrides.submittedBy,
      submitted_by: overrides.submittedBy,
      status: "submitted",
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

async function createReimbursement(overrides: {
  submittedBy: string;
  amount: number;
  personId: string;
}) {
  const { data, error } = await serviceRoleClient
    .from("reimbursements")
    .insert({
      person_id: overrides.personId,
      description: "Integration test reimbursement",
      amount: overrides.amount,
      currency: "USD",
      created_by: overrides.submittedBy,
      submitted_by: overrides.submittedBy,
      status: "submitted",
    })
    .select("id")
    .single();
  if (error) throw error;
  const id = data.id as string;
  return {
    id,
    async cleanup() {
      await serviceRoleClient.from("reimbursements").delete().eq("id", id);
    },
  };
}

describe("count_pending_event_expense_approvals (integration)", () => {
  test("excludes an expense the viewing approver submitted themselves", async () => {
    const adminId = await userId(SEEDED_USERS.admin);
    const before = await count(
      await signInAs(SEEDED_USERS.admin),
      "count_pending_event_expense_approvals",
    );
    const expense = await createExpense({
      submittedBy: adminId,
      amount: 10,
    });

    const after = await count(
      await signInAs(SEEDED_USERS.admin),
      "count_pending_event_expense_approvals",
    );
    expect(after).toBe(before);

    await expense.cleanup();
  });

  test("counts an expense a different approver submitted", async () => {
    const boardId = await userId(SEEDED_USERS.board);
    const before = await count(
      await signInAs(SEEDED_USERS.admin),
      "count_pending_event_expense_approvals",
    );
    const expense = await createExpense({
      submittedBy: boardId,
      amount: 10,
    });

    const after = await count(
      await signInAs(SEEDED_USERS.admin),
      "count_pending_event_expense_approvals",
    );
    expect(after).toBe(before + 1);

    await expense.cleanup();
  });

  test("counts a self-submitted expense under threshold for a self-approval-eligible viewer", async () => {
    const financeId = await userId(SEEDED_USERS.finance);
    const threshold = await expenseApprovalThreshold();
    const before = await count(
      await signInAs(SEEDED_USERS.finance),
      "count_pending_event_expense_approvals",
    );
    const expense = await createExpense({
      submittedBy: financeId,
      amount: threshold - 1,
    });

    const after = await count(
      await signInAs(SEEDED_USERS.finance),
      "count_pending_event_expense_approvals",
    );
    expect(after).toBe(before + 1);

    await expense.cleanup();
  });

  test("excludes a self-submitted expense at/above threshold, even for a self-approval-eligible viewer", async () => {
    const financeId = await userId(SEEDED_USERS.finance);
    const threshold = await expenseApprovalThreshold();
    const before = await count(
      await signInAs(SEEDED_USERS.finance),
      "count_pending_event_expense_approvals",
    );
    const expense = await createExpense({
      submittedBy: financeId,
      amount: threshold,
    });

    const after = await count(
      await signInAs(SEEDED_USERS.finance),
      "count_pending_event_expense_approvals",
    );
    expect(after).toBe(before);

    await expense.cleanup();
  });
});

describe("count_pending_reimbursement_approvals (integration)", () => {
  test("excludes a reimbursement the viewing approver submitted themselves", async () => {
    const boardId = await userId(SEEDED_USERS.board);
    const person = await createPerson();
    const before = await count(
      await signInAs(SEEDED_USERS.board),
      "count_pending_reimbursement_approvals",
    );
    const reimbursement = await createReimbursement({
      submittedBy: boardId,
      amount: 10,
      personId: person.id,
    });

    const after = await count(
      await signInAs(SEEDED_USERS.board),
      "count_pending_reimbursement_approvals",
    );
    expect(after).toBe(before);

    await reimbursement.cleanup();
    await person.cleanup();
  });

  test("counts a reimbursement a different approver submitted", async () => {
    const adminId = await userId(SEEDED_USERS.admin);
    const person = await createPerson();
    const before = await count(
      await signInAs(SEEDED_USERS.board),
      "count_pending_reimbursement_approvals",
    );
    const reimbursement = await createReimbursement({
      submittedBy: adminId,
      amount: 10,
      personId: person.id,
    });

    const after = await count(
      await signInAs(SEEDED_USERS.board),
      "count_pending_reimbursement_approvals",
    );
    expect(after).toBe(before + 1);

    await reimbursement.cleanup();
    await person.cleanup();
  });

  test("counts a self-submitted reimbursement under threshold for a self-approval-eligible viewer", async () => {
    const financeId = await userId(SEEDED_USERS.finance);
    const threshold = await reimbursementApprovalThreshold();
    const person = await createPerson();
    const before = await count(
      await signInAs(SEEDED_USERS.finance),
      "count_pending_reimbursement_approvals",
    );
    const reimbursement = await createReimbursement({
      submittedBy: financeId,
      amount: threshold - 1,
      personId: person.id,
    });

    const after = await count(
      await signInAs(SEEDED_USERS.finance),
      "count_pending_reimbursement_approvals",
    );
    expect(after).toBe(before + 1);

    await reimbursement.cleanup();
    await person.cleanup();
  });
});
