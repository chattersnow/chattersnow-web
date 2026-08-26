import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WorkflowInfoCard } from "@/components/workflow-info-card";
import { SystemSettingsForm } from "./system-settings-form";

function parseThreshold(value: unknown): number | null {
  const threshold = typeof value === "number" ? value : Number(value ?? NaN);
  return Number.isFinite(threshold) ? threshold : null;
}

export default async function SystemSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: expenseSetting }, { data: reimbursementSetting }] =
    await Promise.all([
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "finance.expense_approval_threshold")
        .maybeSingle(),
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "finance.reimbursement_approval_threshold")
        .maybeSingle(),
    ]);

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        System Settings
      </h1>

      <div className="mt-6 space-y-4">
        <WorkflowInfoCard title="How these thresholds are used">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Below the threshold</strong> —
              finance can approve their own expense or reimbursement submission
              on the{" "}
              <Link
                href="/portal/finance/expenses"
                className="underline hover:text-foreground"
              >
                Expenses
              </Link>{" "}
              and{" "}
              <Link
                href="/portal/finance/reimbursements"
                className="underline hover:text-foreground"
              >
                Reimbursements
              </Link>{" "}
              pages.
            </li>
            <li>
              <strong className="text-foreground">
                At or above the threshold
              </strong>{" "}
              — an admin or board member, other than whoever submitted it, has
              to approve or reject it instead.
            </li>
          </ol>
          <p className="mt-3">
            These two numbers don&apos;t do anything on this page directly —
            they&apos;re read by the expense and reimbursement approval flow
            each time an approver opens a submission, so changing one here
            changes behavior on those two pages immediately, without a code
            change.
          </p>
        </WorkflowInfoCard>
        <SystemSettingsForm
          expenseApprovalThreshold={parseThreshold(expenseSetting?.value)}
          reimbursementApprovalThreshold={parseThreshold(
            reimbursementSetting?.value,
          )}
        />
      </div>
    </>
  );
}
