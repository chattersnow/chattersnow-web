import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ExpenseApprovalWorkflowInfo } from "./approval-workflow-info";
import { ExpensesTable } from "./expenses-table";
import { EXPENSE_COLUMNS, getExpenseApprovalContext, type EventOption, type ExpenseRow } from "./expenses-shared";

export default async function ExpensesPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: expenses }, { data: events }, approvalContext] = await Promise.all([
    supabase.from("event_expenses").select(EXPENSE_COLUMNS).order("expense_date", { ascending: false }),
    supabase.from("events").select("id, name").order("name", { ascending: true }),
    getExpenseApprovalContext(supabase),
  ]);

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Expenses
      </h1>

      <div className="mt-6 space-y-4">
        <ExpenseApprovalWorkflowInfo threshold={approvalContext.threshold} />
        <ExpensesTable
          expenses={(expenses ?? []) as unknown as ExpenseRow[]}
          events={(events ?? []) as EventOption[]}
          approvalContext={approvalContext}
        />
      </div>
    </>
  );
}
