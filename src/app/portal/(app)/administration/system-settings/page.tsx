import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SITE_IMAGE_SLOTS, siteImageSettingKey } from "@/lib/site-images";
import { PUBLIC_PAGE_SLOTS, getPageVisibility } from "@/lib/page-visibility";
import { SystemSettingsForm } from "./system-settings-form";
import { SiteImagesPanel } from "./site-images-panel";
import { PageVisibilityPanel } from "./page-visibility-panel";

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

  const pageVisibility = await getPageVisibility(supabase);

  const siteImageUrls: Record<string, string | null> = {};
  for (const slot of SITE_IMAGE_SLOTS) {
    const row = siteImageSettings?.find(
      (setting) => setting.key === siteImageSettingKey(slot.key),
    );
    siteImageUrls[slot.key] = typeof row?.value === "string" ? row.value : null;
  }

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          System Settings
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <Tabs defaultValue="workflow" className="mt-6">
        <div className="rainbow-surface flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <TabsList variant="line">
            <TabsTrigger value="workflow">Workflow settings</TabsTrigger>
            <TabsTrigger value="images">Image settings</TabsTrigger>
            <TabsTrigger value="visibility">Page visibility</TabsTrigger>
          </TabsList>
        </div>

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

        <TabsContent value="visibility" className="mt-6 space-y-4">
          <p className="app-muted max-w-3xl text-sm leading-relaxed">
            Control which sections of the public website are live. A hidden
            section disappears from the site navigation and its pages return
            &ldquo;not found&rdquo; — use this to hold content back until the
            board has approved it. Every change here is recorded in the audit
            log.
          </p>
          <PageVisibilityPanel
            slots={PUBLIC_PAGE_SLOTS}
            visibility={pageVisibility}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
