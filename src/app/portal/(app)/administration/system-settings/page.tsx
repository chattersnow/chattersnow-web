import { createSupabaseServerClient } from "@/lib/supabase/server";
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

      <div className="mt-6">
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
