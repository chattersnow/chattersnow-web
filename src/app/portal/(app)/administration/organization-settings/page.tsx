import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TabsContent } from "@/components/ui/tabs";
import { WorkflowThresholdsForm } from "./workflow-thresholds-form";
import { OrganizationSettingsTabs } from "./organization-settings-tabs";
import { NotificationsPanel } from "./notifications-panel";
import { FiscalYearPanel } from "./fiscal-year-panel";
import { BrandingPanel } from "./branding-panel";
import { DataPanel } from "./data-panel";
import { getFiscalYearStartMonth } from "@/lib/fiscal-year";
import { SALES_TAX_RATE_SETTING_KEY } from "@/lib/sales-tax";
import { getTenantBranding } from "@/lib/tenant-branding";
import { getStoredLexicon } from "@/lib/tenant-lexicon";
import { getStoredPersonRoleLabels } from "@/lib/tenant-person-roles";
import { LexiconPanel } from "./lexicon-panel";
import { PersonRolesPanel } from "./person-roles-panel";
import { NOTIFICATION_KINDS } from "@/lib/notifications/kinds";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
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
    branding,
    tenantContext,
    emailEnabled,
    storedLexicon,
    storedPersonRoleLabels,
  ] = await Promise.all([
    getFiscalYearStartMonth(supabase),
    getTenantBranding(supabase),
    getTenantContext(supabase),
    getOrgEmailEnabled(supabase),
    getStoredLexicon(supabase),
    getStoredPersonRoleLabels(supabase),
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
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Organization Settings
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <OrganizationSettingsTabs>
        <TabsContent value="general" className="mt-6 space-y-4">
          <p className="app-muted max-w-3xl text-sm leading-relaxed">
            Organization-wide settings that the rest of the portal reads. The
            fiscal year is set by Board resolution under the bylaws, so changing
            it here should follow that resolution — every change is recorded in
            the audit log.
          </p>
          <FiscalYearPanel fiscalYearStartMonth={fiscalYearStartMonth} />
          <p className="app-muted max-w-3xl text-sm leading-relaxed">
            What this organization calls the things it lends. The platform says
            &ldquo;inventory&rdquo; and &ldquo;items&rdquo;; yours may be a gear
            library, a tool library or a pantry, and these words are what the
            public navigation, this portal&rsquo;s sidebar and the unwritten
            parts of your site copy use. Leave a field blank to keep the
            platform&rsquo;s word.
          </p>
          <LexiconPanel stored={storedLexicon} />
          <p className="app-muted max-w-3xl text-sm leading-relaxed">
            What this organization calls the people in its directory. The
            platform says &ldquo;donors&rdquo; and &ldquo;volunteers&rdquo;;
            yours may have members, students, customers or clients, and these
            words are what the People section of the sidebar, its pages, the
            role filter and every person&rsquo;s profile use. Only the words
            change: a role is still set by the donation, registration or shift
            behind it, whatever you call the person who did it. Leave a field
            blank to keep the platform&rsquo;s word.
          </p>
          <PersonRolesPanel stored={storedPersonRoleLabels} />
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
            The colours, accent bar and logo the public site and this portal
            use. Leave a field blank to keep the platform default. Every change
            is recorded in the audit log.
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
