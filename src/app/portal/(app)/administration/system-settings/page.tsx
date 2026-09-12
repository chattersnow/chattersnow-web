import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TabsContent } from "@/components/ui/tabs";
import {
  getTenantModules,
  getTenantPageVisibility,
  moduleBlockedSlots,
  namedSlots,
} from "@/lib/page-visibility";
import { LAYOUT_SLOTS, getTenantLayoutValues } from "@/lib/site-layout";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";
import { getTenantLegalPublication } from "@/lib/legal-publication";
import { SystemSettingsForm } from "./system-settings-form";
import { SystemSettingsTabs } from "./system-settings-tabs";
import { PageVisibilityPanel } from "./page-visibility-panel";
import {
  LegalDocumentsPanel,
  type LegalDocumentStatus,
} from "./legal-documents-panel";
import { LayoutPanel } from "./layout-panel";
import { NotificationsPanel } from "./notifications-panel";
import { OrganizationSettingsPanel } from "./organization-settings-panel";
import { BrandingPanel } from "./branding-panel";
import { DataPanel } from "./data-panel";
import { getFiscalYearStartMonth } from "@/lib/fiscal-year";
import { getTenantBranding } from "@/lib/tenant-branding";
import { getStoredLexicon, getTenantLexicon } from "@/lib/tenant-lexicon";
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
  title: "System Settings",
};

export default async function SystemSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const [
    { data: expenseSetting },
    { data: reimbursementSetting },
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
      .eq("key", OPS_REPORT_RECIPIENTS_SETTING_KEY)
      .maybeSingle(),
    supabase
      .from("app_settings")
      .select("key, value")
      .in("key", [REPLY_TO_SETTING_KEY, FROM_ADDRESS_SETTING_KEY]),
  ]);

  const [
    pageVisibility,
    legalPublication,
    { data: ownLegalDocuments },
    layoutValues,
    fiscalYearStartMonth,
    branding,
    tenantContext,
    emailEnabled,
    tenantModules,
    lexicon,
    storedLexicon,
    storedPersonRoleLabels,
  ] = await Promise.all([
    getTenantPageVisibility(supabase),
    getTenantLegalPublication(supabase),
    // Which of the three this tenant has published text of its own for, so the
    // panel can say what each route is actually serving rather than only
    // whether it is served (#859). A published row is `value not null`; a draft
    // is not being served and does not count.
    supabase
      .from("site_content")
      .select("key, value")
      .like("key", "legal.%")
      .not("value", "is", null),
    getTenantLayoutValues(supabase),
    getFiscalYearStartMonth(supabase),
    getTenantBranding(supabase),
    getTenantContext(supabase),
    getOrgEmailEnabled(supabase),
    getTenantModules(supabase),
    getTenantLexicon(supabase),
    getStoredLexicon(supabase),
    getStoredPersonRoleLabels(supabase),
  ]);
  const orgName = currentTenant(tenantContext)?.name ?? "this organization";

  // Sections this organization has not been sold (#902). The switches for them
  // render read-only and off: the flag would be written and then ignored by the
  // gate, and a control that silently does nothing is worse than one that says
  // why it cannot.
  const blockedSlots = moduleBlockedSlots(tenantModules);

  const ownLegalSlots = new Set(
    (ownLegalDocuments ?? []).map((row) => row.key as string),
  );
  const legalStatuses: LegalDocumentStatus[] = LEGAL_DOCUMENTS.map(
    (document) => ({
      key: document.key,
      inForce: Boolean(legalPublication[document.key]),
      ownDocument: ownLegalSlots.has(document.slotKey),
    }),
  );

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
          System Settings
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <SystemSettingsTabs>
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

        <TabsContent value="layout" className="mt-6 space-y-4">
          <p className="app-muted max-w-3xl text-sm leading-relaxed">
            How the public site is arranged, for the parts that aren&rsquo;t
            copy or colour. Page visibility decides whether a section exists at
            all; these settings decide how much of it a page shows. Every change
            here is recorded in the audit log.
          </p>
          <LayoutPanel slots={LAYOUT_SLOTS} values={layoutValues} />
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
            slots={namedSlots(lexicon)}
            visibility={pageVisibility}
            blockedSlots={blockedSlots}
          />
        </TabsContent>

        <TabsContent value="legal" className="mt-6 space-y-4">
          <p className="app-muted max-w-3xl text-sm leading-relaxed">
            Which of the three legal documents this organization serves on its
            public site. This is not a show/hide control: putting one in force
            is saying the text is yours and governs using your site, so a
            document nobody has adopted stays off rather than being published
            under your name. The privacy policy is always served &mdash; the
            site collects personal information through its public forms, and a
            policy saying what happens to it has to be reachable while it does.
            Write or replace the text itself in Website &rarr;{" "}
            <Link
              href="/portal/website?page=legal"
              className="underline underline-offset-4"
            >
              Pages
            </Link>
            . Every change here is recorded in the audit log.
          </p>
          <LegalDocumentsPanel
            documents={LEGAL_DOCUMENTS}
            statuses={legalStatuses}
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
      </SystemSettingsTabs>
    </>
  );
}
