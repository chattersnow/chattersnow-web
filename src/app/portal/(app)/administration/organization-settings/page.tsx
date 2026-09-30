import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TabsContent } from "@/components/ui/tabs";
import { WorkflowThresholdsForm } from "./workflow-thresholds-form";
import { OrganizationSettingsTabs } from "./organization-settings-tabs";
import { NotificationsPanel } from "./notifications-panel";
import { FiscalYearPanel } from "./fiscal-year-panel";
import { TimeZonePanel } from "./timezone-panel";
import { BrandingPanel } from "./branding-panel";
import { DataPanel } from "./data-panel";
import { getFiscalYearStartMonth } from "@/lib/fiscal-year";
import { getOrgTimeZone } from "@/lib/org-timezone";
import { SALES_TAX_RATE_SETTING_KEY } from "@/lib/sales-tax";
import { getTenantBranding } from "@/lib/tenant-branding";
import { getStoredLexicon } from "@/lib/tenant-lexicon";
import { getStoredPersonRoleLabels } from "@/lib/tenant-person-roles";
import { LexiconPanel } from "./lexicon-panel";
import { PersonRolesPanel } from "./person-roles-panel";
import { NOTIFICATION_KINDS } from "@/lib/notifications/kinds";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
import { getNotificationRecipients } from "@/lib/notifications/recipients";
import {
  OPS_REPORT_RECIPIENTS_SETTING_KEY,
  parseOpsReportRecipients,
} from "@/lib/notifications/ops-report";
import { currentTenant, getTenantContext } from "@/lib/portal/tenants";
import {
  FROM_ADDRESS_SETTING_KEY,
  REPLY_TO_SETTING_KEY,
  bareAddress,
  isAllowedFromAddress,
  settingAddress,
  verifiedSendingDomains,
} from "@/lib/email/identity";

function parseThreshold(value: unknown): number | null {
  const threshold = typeof value === "number" ? value : Number(value ?? NaN);
  return Number.isFinite(threshold) ? threshold : null;
}

export const metadata: Metadata = {
  title: "Organization Settings",
};

/**
 * Renamed from System Settings by #992, once #990 left it holding nothing but
 * the organization: its fiscal year and vocabulary, its approval thresholds,
 * its identity, its email and its data. Nothing here was ever about "the
 * system", and with the three public-site panels gone the old name had nothing
 * left to hide behind.
 *
 * Not "Tenant Settings", which was considered: `tenant` appears in portal copy
 * only inside the operator-only Platform section, while a tenant's own portal
 * says "this organization". Tenancy is how the platform is built, not what the
 * customer is called, and this page is the customer's.
 */
export default async function OrganizationSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const [
    { data: expenseSetting },
    { data: reimbursementSetting },
    { data: salesTaxSetting },
    { data: opsReportSetting },
    { data: mailIdentitySettings },
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
      .select("value")
      .eq("key", SALES_TAX_RATE_SETTING_KEY)
      .maybeSingle(),
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", OPS_REPORT_RECIPIENTS_SETTING_KEY)
      .maybeSingle(),
    supabase
      .from("app_settings")
      .select("key, value")
      .in("key", [REPLY_TO_SETTING_KEY, FROM_ADDRESS_SETTING_KEY]),
  ]);

  const [
    fiscalYearStartMonth,
    orgTimeZone,
    branding,
    tenantContext,
    emailEnabled,
    storedLexicon,
    storedPersonRoleLabels,
    recipientsByKind,
  ] = await Promise.all([
    getFiscalYearStartMonth(supabase),
    getOrgTimeZone(supabase),
    getTenantBranding(supabase),
    getTenantContext(supabase),
    getOrgEmailEnabled(supabase),
    getStoredLexicon(supabase),
    getStoredPersonRoleLabels(supabase),
    getNotificationRecipients(supabase),
  ]);
  const orgName = currentTenant(tenantContext)?.name ?? "this organization";

  // What the tenant may actually put in the From field: its own domain, and
  // only once the operator has verified it with the provider (#857). Anything
  // else and the field renders read-only rather than pretending to be
  // self-service -- resolveMailIdentity() would ignore the value anyway.
  const tenantId = currentTenant(tenantContext)?.id;
  const { data: tenantDomain } = tenantId
    ? await supabase
        .from("tenants")
        .select("custom_domain")
        .eq("id", tenantId)
        .maybeSingle()
    : { data: null };

  const platformFrom = process.env.EMAIL_FROM ?? null;
  const customDomain = (tenantDomain?.custom_domain as string) ?? null;
  const mailSettings = new Map(
    (mailIdentitySettings ?? []).map((row) => [row.key as string, row.value]),
  );
  const sendingDomain =
    customDomain &&
    isAllowedFromAddress(`x@${customDomain}`, {
      verifiedDomains: verifiedSendingDomains(platformFrom),
      tenantCustomDomain: customDomain,
    })
      ? customDomain
      : null;

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Organization Settings
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <OrganizationSettingsTabs>
        {/* Two groups of paired cards (#1482), so every card's heading is in
            the first screen at desktop width. The explanations that used to
            sit between the cards are in the help sheet; each card keeps the
            one line to know before saving. Below `lg` (`xl` for the naming
            cards, whose role rows need the width) it is one column in the
            order the cards always had. */}
        <TabsContent value="general" className="mt-6 space-y-8">
          <section aria-labelledby="settings-calendar" className="space-y-3">
            <h2 id="settings-calendar" className="app-eyebrow text-sm">
              Calendar
            </h2>
            <div className="grid gap-6 lg:grid-cols-2">
              <FiscalYearPanel fiscalYearStartMonth={fiscalYearStartMonth} />
              <TimeZonePanel timeZone={orgTimeZone} />
            </div>
          </section>
          <section aria-labelledby="settings-vocabulary" className="space-y-3">
            <h2 id="settings-vocabulary" className="app-eyebrow text-sm">
              Vocabulary
            </h2>
            <div className="grid gap-6 xl:grid-cols-2">
              <LexiconPanel stored={storedLexicon} />
              <PersonRolesPanel stored={storedPersonRoleLabels} />
            </div>
          </section>
        </TabsContent>

        <TabsContent value="workflow" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="app-muted max-w-2xl text-sm leading-relaxed">
              These thresholds control who can approve an expense or
              reimbursement on their own. The sales tax rate is what the
              register charges on merchandise.
            </p>
          </div>
          <WorkflowThresholdsForm
            expenseApprovalThreshold={parseThreshold(expenseSetting?.value)}
            reimbursementApprovalThreshold={parseThreshold(
              reimbursementSetting?.value,
            )}
            salesTaxRate={parseThreshold(salesTaxSetting?.value)}
          />
        </TabsContent>

        <TabsContent value="branding" className="mt-6 space-y-4">
          <p className="app-muted max-w-3xl text-sm leading-relaxed">
            The colours, accent bar, logo and typefaces the public site and this
            portal use. Leave a field blank to keep the platform default. Every
            change is recorded in the audit log.
          </p>
          <BrandingPanel branding={branding} />
        </TabsContent>

        <TabsContent value="notifications" className="mt-6 space-y-4">
          <p className="app-muted max-w-3xl text-sm leading-relaxed">
            The organization-wide switch for every email this portal sends. It
            is a stop, not a preference: individual people choose what they want
            in{" "}
            <Link
              href="/portal/account"
              className="underline underline-offset-4"
            >
              My Account &rarr; Email notifications
            </Link>
            , and this overrides all of them &mdash; including the daily ops
            report below, which goes to a shared inbox rather than to
            anyone&rsquo;s account. Every change here is recorded in the audit
            log.
          </p>
          <NotificationsPanel
            emailEnabled={emailEnabled}
            kinds={NOTIFICATION_KINDS}
            recipientsByKind={recipientsByKind}
            orgName={orgName}
            platformFrom={bareAddress(platformFrom)}
            sendingDomain={sendingDomain}
            replyTo={settingAddress(mailSettings.get(REPLY_TO_SETTING_KEY))}
            fromAddress={settingAddress(
              mailSettings.get(FROM_ADDRESS_SETTING_KEY),
            )}
            opsReportRecipients={parseOpsReportRecipients(
              opsReportSetting?.value,
            )}
          />
        </TabsContent>

        <TabsContent value="data" className="mt-6 space-y-4">
          <DataPanel orgName={orgName} />
        </TabsContent>
      </OrganizationSettingsTabs>
    </>
  );
}
