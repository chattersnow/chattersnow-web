import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WorkflowInfoCard } from "@/components/workflow-info-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SITE_IMAGE_SLOTS, siteImageSettingKey } from "@/lib/site-images";
import { SystemSettingsForm } from "./system-settings-form";
import { SiteImagesPanel } from "./site-images-panel";

function parseThreshold(value: unknown): number | null {
  const threshold = typeof value === "number" ? value : Number(value ?? NaN);
  return Number.isFinite(threshold) ? threshold : null;
}

export default async function SystemSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const [
    { data: expenseSetting },
    { data: reimbursementSetting },
    { data: siteImageSettings },
  ] = await Promise.all([
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
    supabase
      .from("app_settings")
      .select("key, value")
      .like("key", "site_images.%"),
  ]);

  const siteImageUrls: Record<string, string | null> = {};
  for (const slot of SITE_IMAGE_SLOTS) {
    const row = siteImageSettings?.find(
      (setting) => setting.key === siteImageSettingKey(slot.key),
    );
    siteImageUrls[slot.key] = typeof row?.value === "string" ? row.value : null;
  }

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        System Settings
      </h1>

      <Tabs defaultValue="workflow" className="mt-6">
        <TabsList variant="line">
          <TabsTrigger value="workflow">Workflow settings</TabsTrigger>
          <TabsTrigger value="images">Image settings</TabsTrigger>
        </TabsList>

        <TabsContent value="workflow" className="mt-6 space-y-4">
          <WorkflowInfoCard title="How these thresholds are used">
            <ol className="list-decimal space-y-2 pl-4">
              <li>
                <strong className="text-foreground">Below the threshold</strong>{" "}
                — finance can approve their own expense or reimbursement
                submission on the{" "}
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
        </TabsContent>

        <TabsContent value="images" className="mt-6 space-y-4">
          <p className="app-muted max-w-3xl text-sm leading-relaxed">
            Set a Google Drive image for each placeholder slot on the public
            site. Leave a slot blank to fall back to the default icon
            placeholder.
          </p>
          <SiteImagesPanel slots={SITE_IMAGE_SLOTS} urls={siteImageUrls} />
        </TabsContent>
      </Tabs>
    </>
  );
}
