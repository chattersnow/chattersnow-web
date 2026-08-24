import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ExpenseApprovalWorkflowInfo } from "./approval-workflow-info";
import { ExpensesTable } from "./expenses-table";
import {
  EXPENSE_COLUMNS,
  getExpenseApprovalContext,
  isExpenseStatus,
  type EventOption,
  type ExpenseRow,
} from "./expenses-shared";

type ExpensesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ExpensesPage({
  searchParams,
}: ExpensesPageProps) {
  const supabase = await createSupabaseServerClient();

  const params = await searchParams;
  const statusRaw = params.status;
  const statusParam = Array.isArray(statusRaw) ? statusRaw[0] : statusRaw;
  const initialStatusFilter = isExpenseStatus(statusParam) ? statusParam : null;

  const [{ data: expenses }, { data: events }, approvalContext] =
    await Promise.all([
      supabase
        .from("event_expenses")
        .select(EXPENSE_COLUMNS)
        .order("expense_date", { ascending: false }),
      supabase
        .from("events")
        .select("id, name")
        .order("name", { ascending: true }),
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
          initialStatusFilter={initialStatusFilter}
        />
      </div>
    </>
  );
}
