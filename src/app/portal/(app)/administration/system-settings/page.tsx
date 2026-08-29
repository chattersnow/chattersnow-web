import { createSupabaseServerClient } from "@/lib/supabase/server";
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
      <div className="rainbow-accent w-16" />
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        System Settings
      </h1>

      <Tabs defaultValue="workflow" className="mt-6">
        <TabsList variant="line">
          <TabsTrigger value="workflow">Workflow settings</TabsTrigger>
          <TabsTrigger value="images">Image settings</TabsTrigger>
        </TabsList>

        <TabsContent value="workflow" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="app-muted max-w-2xl text-sm leading-relaxed">
              These thresholds control who can approve an expense or
              reimbursement on their own.
            </p>
          </div>
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
