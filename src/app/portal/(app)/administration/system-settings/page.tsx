import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SITE_IMAGE_SLOTS, siteImageSettingKey } from "@/lib/site-images";
import { PUBLIC_PAGE_SLOTS, getPageVisibility } from "@/lib/page-visibility";
import { SystemSettingsForm } from "./system-settings-form";
import { SiteImagesPanel } from "./site-images-panel";
import { PageVisibilityPanel } from "./page-visibility-panel";
import { NotificationsPanel } from "./notifications-panel";
import { OrganizationSettingsPanel } from "./organization-settings-panel";
import { BrandingPanel } from "./branding-panel";
import { DataPanel } from "./data-panel";
import { getFiscalYearStartMonth } from "@/lib/fiscal-year";
import { getTenantBranding } from "@/lib/tenant-branding";
import { NOTIFICATION_KINDS } from "@/lib/notifications/kinds";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
import {
  OPS_REPORT_RECIPIENTS_SETTING_KEY,
  parseOpsReportRecipients,
} from "@/lib/notifications/ops-report";
import { currentTenant, getTenantContext } from "@/lib/portal/tenants";

function parseThreshold(value: unknown): number | null {
  const threshold = typeof value === "number" ? value : Number(value ?? NaN);
  return Number.isFinite(threshold) ? threshold : null;
}

export const metadata: Metadata = {
  title: "System Settings",
};

export default async function SystemSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const [
    { data: expenseSetting },
    { data: reimbursementSetting },
    { data: siteImageSettings },
    { data: opsReportSetting },
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
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", OPS_REPORT_RECIPIENTS_SETTING_KEY)
      .maybeSingle(),
  ]);

  const [
    pageVisibility,
    fiscalYearStartMonth,
    branding,
    tenantContext,
    emailEnabled,
  ] = await Promise.all([
    getPageVisibility(supabase),
    getFiscalYearStartMonth(supabase),
    getTenantBranding(supabase),
    getTenantContext(supabase),
    getOrgEmailEnabled(supabase),
  ]);
  const orgName = currentTenant(tenantContext)?.name ?? "this organization";

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

      <Tabs defaultValue="organization" className="mt-6">
        <div className="rainbow-surface flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <TabsList
            variant="line"
            className="flex-wrap group-data-horizontal/tabs:h-auto"
          >
            <TabsTrigger value="organization">Organization</TabsTrigger>
            <TabsTrigger value="workflow">Workflow settings</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="images">Image settings</TabsTrigger>
            <TabsTrigger value="visibility">Page visibility</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="organization" className="mt-6 space-y-4">
          <p className="app-muted max-w-3xl text-sm leading-relaxed">
            Organization-wide settings that the rest of the portal reads. The
            fiscal year is set by Board resolution under the bylaws, so changing
            it here should follow that resolution — every change is recorded in
            the audit log.
          </p>
          <OrganizationSettingsPanel
            fiscalYearStartMonth={fiscalYearStartMonth}
          />
        </TabsContent>

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

        <TabsContent value="branding" className="mt-6 space-y-4">
          <p className="app-muted max-w-3xl text-sm leading-relaxed">
            The colours, accent bar and logo the public site and this portal
            use. Leave a field blank to keep the platform default. Every change
            is recorded in the audit log.
          </p>
          <BrandingPanel branding={branding} />
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

        <TabsContent value="notifications" className="mt-6 space-y-4">
          <p className="app-muted max-w-3xl text-sm leading-relaxed">
            The organization-wide switch for every email this portal sends. It
            is a stop, not a preference: individual people choose what they want
            on their own account pages, and this overrides all of them &mdash;
            including the daily ops report below, which goes to a shared inbox
            rather than to anyone&rsquo;s account. Every change here is recorded
            in the audit log.
          </p>
          <NotificationsPanel
            emailEnabled={emailEnabled}
            kinds={NOTIFICATION_KINDS}
            opsReportRecipients={parseOpsReportRecipients(
              opsReportSetting?.value,
            )}
          />
        </TabsContent>

        <TabsContent value="data" className="mt-6 space-y-4">
          <DataPanel orgName={orgName} />
        </TabsContent>
      </Tabs>
    </>
  );
}
