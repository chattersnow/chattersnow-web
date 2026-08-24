import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WorkflowInfoCard } from "@/components/workflow-info-card";
import { ExpensesTable } from "./expenses-table";
import {
  EXPENSE_COLUMNS,
  formatAmount,
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
        <WorkflowInfoCard title="How expense approval works">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Submitted</strong> — finance
              or an event coordinator records an expense. Every expense starts
              here.
            </li>
            <li>
              <strong className="text-foreground">Approved or rejected</strong>{" "}
              —
              {approvalContext.threshold !== null ? (
                <>
                  {" "}
                  below {formatAmount(approvalContext.threshold, "USD")},
                  finance can approve their own submission. At or above that, an
                  admin or board member — someone other than whoever submitted
                  it — has to approve or reject it.
                </>
              ) : (
                <>
                  {" "}
                  an admin or board member, other than whoever submitted it,
                  approves or rejects it.
                </>
              )}
            </li>
            <li>
              <strong className="text-foreground">Paid</strong> — once approved,
              finance or admin marks it as paid after payment has actually been
              sent.
            </li>
          </ol>
          <p className="mt-3">
            The threshold is a setting, not a fixed rule — admin or board can
            change it anytime in{" "}
            <Link
              href="/portal/administration/system-settings"
              className="underline hover:text-foreground"
            >
              Administration &gt; System Settings
            </Link>{" "}
            without a code change.
          </p>
        </WorkflowInfoCard>
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
