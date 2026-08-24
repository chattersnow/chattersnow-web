import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SystemSettingsForm } from "./system-settings-form";

export default async function SystemSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "finance.expense_approval_threshold")
    .maybeSingle();

  const threshold =
    typeof data?.value === "number" ? data.value : Number(data?.value ?? NaN);

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        System Settings
      </h1>

      <div className="mt-6">
        <SystemSettingsForm
          expenseApprovalThreshold={
            Number.isFinite(threshold) ? threshold : null
          }
        />
      </div>
    </>
  );
}
