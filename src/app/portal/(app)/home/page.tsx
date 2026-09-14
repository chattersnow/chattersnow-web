import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantLexicon } from "@/lib/tenant-lexicon";
import {
  DENIED_PARAM,
  getCurrentUserPermissions,
  hasPermission,
  hasAnyPermission,
} from "@/lib/auth/permissions";
import { resolveCurrentPersonId } from "@/lib/auth/current-person";
import { deviceClass } from "@/lib/portal/device";
import {
  getUpcomingSummary,
  getFinancialSummary,
  getInventorySummary,
  getMyActiveEvents,
  getOrganizationSummary,
} from "./queries";
import { getAccessManagementStatsSummary } from "@/lib/portal/access-management/queries";
import { getEventTaskSummary } from "@/lib/portal/attention-items";
import {
  fiscalYearForDate,
  fiscalYearToDateRange,
  formatFiscalYearLabel,
  getFiscalYearStartMonth,
} from "@/lib/fiscal-year";
import { listRecentDonationsAction } from "./actions";
import { getOrgTimeZone } from "@/lib/org-timezone";
import { todayInZone, utcDateFromIsoDay } from "@/lib/time";
import type { DashboardData } from "./dashboard-data";
import { HomeDesktop } from "./home-desktop";
import { HomeMobile } from "./home-mobile";

export const metadata: Metadata = {
  title: "Dashboard",
};

type PortalHomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The area a permission guard refused, if this render is the tail end of one.
 * A denial used to be a bare redirect here, which reads as a broken link
 * rather than as "you don't have that yet".
 */
function deniedAreaFrom(
  params: Record<string, string | string[] | undefined>,
): string | null {
  const raw = params[DENIED_PARAM];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  return value === "1" ? "That page" : value;
}

export default async function PortalHomePage({
  searchParams,
}: PortalHomePageProps) {
  const deniedArea = deniedAreaFrom(await searchParams);
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);

  const canSeeUpcoming = hasPermission(permissions, "events", "view");
  const canSeeFinancial = hasAnyPermission(permissions, [
    { resource: "finance", level: "manage" },
    { resource: "finance_reports", level: "view" },
  ]);
  // Individual widgets are RLS-backed by narrower resources than the section
  // gate above (e.g. board has finance_reports:view but not event_expenses or
  // events), so each live-data widget checks its own resource or it would
  // render a misleading zero instead of just not appearing.
  const canSeeExpenses = hasPermission(permissions, "event_expenses", "view");
  const canSeeRevenue = hasAnyPermission(permissions, [
    { resource: "event_revenue", level: "view" },
    { resource: "sales", level: "view" },
  ]);
  const canSeeReimbursements = hasPermission(
    permissions,
    "reimbursements",
    "view",
  );
  const canSeeEventBudgets = canSeeUpcoming;
  const canSeeRecentDonations = hasPermission(permissions, "finance", "view");
  const canSeeInventory = hasAnyPermission(permissions, [
    { resource: "inventory", level: "manage" },
    { resource: "inventory_reports", level: "view" },
  ]);
  // Every Organization widget's backing table gates select on
  // governance:view, so view (not manage) is the right section gate —
  // board members with read-only governance access should see it.
  const canSeeOrganization = hasPermission(permissions, "governance", "view");
  const canSeeAccessManagement = hasPermission(
    permissions,
    "access_management_assets",
    "view",
  );
  const canCheckIn = hasPermission(permissions, "events", "manage");
  const canRecordDonation = hasAnyPermission(permissions, [
    { resource: "finance", level: "manage" },
    { resource: "inventory_intake", level: "manage" },
  ]);
  const canRecordDistribution = hasAnyPermission(permissions, [
    { resource: "inventory", level: "manage" },
    { resource: "inventory_intake", level: "manage" },
  ]);

  // Two clocks, on purpose. `nowIso` is a real instant, for "what is coming
  // up"; every *day* below is the organization's day, because the finance
  // rollup buckets in the org's zone (#1065) and the tiles must be cut on the
  // same boundary. Off the server's UTC clock, "this month" rolled over to the
  // next month at 6pm on the last day of this one.
  const nowIso = new Date().toISOString();

  const [orgTimeZone, fiscalYearStartMonth] = await Promise.all([
    getOrgTimeZone(supabase),
    getFiscalYearStartMonth(supabase),
  ]);
  const todayDate = todayInZone(orgTimeZone);
  const startOfMonthDate = `${todayDate.slice(0, 7)}-01`;
  const today = utcDateFromIsoDay(todayDate);

  // "This year" on this dashboard means the org's fiscal year, not the
  // calendar year -- a winter season spans the new year, so a January boundary
  // would split one season's income across two of these figures.
  const currentFiscalYear = fiscalYearForDate(today, fiscalYearStartMonth);
  const fiscalYearLabel = formatFiscalYearLabel(currentFiscalYear);
  const { from: startOfYearDate } = fiscalYearToDateRange(
    today,
    fiscalYearStartMonth,
  );

  const [
    upcoming,
    eventTasks,
    financial,
    inventory,
    accessManagementStats,
    recentDonationsResult,
    organization,
    personId,
  ] = await Promise.all([
    canSeeUpcoming
      ? getUpcomingSummary(supabase, nowIso)
      : Promise.resolve(null),
    canSeeUpcoming
      ? // canCheckIn is events:manage, the same gate outstanding tasks need
        getEventTaskSummary(supabase, { canManageEvents: canCheckIn }, nowIso)
      : Promise.resolve(null),
    canSeeFinancial
      ? getFinancialSummary(
          supabase,
          startOfMonthDate,
          startOfYearDate,
          nowIso,
          todayDate,
        )
      : Promise.resolve(null),
    canSeeInventory ? getInventorySummary(supabase) : Promise.resolve(null),
    canSeeAccessManagement
      ? getAccessManagementStatsSummary(supabase)
      : Promise.resolve(null),
    canSeeInventory && canSeeRecentDonations
      ? listRecentDonationsAction(5)
      : Promise.resolve(null),
    canSeeOrganization
      ? getOrganizationSummary(supabase, nowIso, todayDate, currentFiscalYear)
      : Promise.resolve(null),
    resolveCurrentPersonId(supabase),
  ]);

  // The Inventory card is named in this organization's own word (#896).
  const lexicon = await getTenantLexicon(supabase);
  const openTaskCount = eventTasks?.items.length ?? 0;
  const recentDonations =
    recentDonationsResult && "data" in recentDonationsResult
      ? recentDonationsResult.data
      : [];
  const activeEvents =
    personId || canCheckIn
      ? await getMyActiveEvents(supabase, personId, nowIso, canCheckIn)
      : [];

  const anySectionVisible =
    canSeeUpcoming ||
    canSeeFinancial ||
    canSeeInventory ||
    canSeeAccessManagement ||
    canSeeOrganization ||
    activeEvents.length > 0;

  const data: DashboardData = {
    lexicon,
    deniedArea,
    anySectionVisible,
    activeEvents,
    canCheckIn,
    canRecordDonation,
    canRecordDistribution,
    canSeeUpcoming,
    upcoming,
    openTaskCount,
    canSeeFinancial,
    financial,
    fiscalYearLabel,
    canSeeExpenses,
    canSeeRevenue,
    canSeeReimbursements,
    canSeeEventBudgets,
    canSeeInventory,
    inventory,
    canSeeRecentDonations,
    recentDonations,
    canSeeAccessManagement,
    accessManagementStats,
    canSeeOrganization,
    organization,
  };

  // One page, one set of queries, two presentations (#1079). Everything above
  // runs identically either way; only what gets rendered forks, so deep links,
  // breadcrumbs and the command palette keep working untouched.
  const device = await deviceClass();
  return device === "mobile" ? (
    <HomeMobile {...data} />
  ) : (
    <HomeDesktop {...data} />
  );
}
