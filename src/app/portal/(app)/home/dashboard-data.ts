import type { Lexicon } from "@/lib/lexicon";
import type {
  getUpcomingSummary,
  getFinancialSummary,
  getInventorySummary,
  getMyActiveEvents,
  getOrganizationSummary,
} from "./queries";
import type { getAccessManagementStatsSummary } from "@/lib/portal/access-management/queries";
import type { EventDonationRow } from "./actions";

type Unwrap<T> = Awaited<
  ReturnType<T extends (...a: never[]) => unknown ? T : never>
>;

/**
 * Everything `/portal/home` has read, handed to whichever dashboard renders it
 * (#1079).
 *
 * The page does the work once -- the permission checks, the fiscal-year
 * boundaries and the `Promise.all` over seven summaries -- and only the
 * presentation forks. The shapes are derived from the query functions rather
 * than restated, so a column added to a summary reaches both dashboards
 * without a second declaration to keep in step.
 */
export type DashboardData = {
  lexicon: Lexicon;
  deniedArea: string | null;
  anySectionVisible: boolean;

  activeEvents: Unwrap<typeof getMyActiveEvents>;
  canCheckIn: boolean;
  canRecordDonation: boolean;
  canRecordDistribution: boolean;

  canSeeUpcoming: boolean;
  upcoming: Unwrap<typeof getUpcomingSummary> | null;
  openTaskCount: number;

  canSeeFinancial: boolean;
  financial: Unwrap<typeof getFinancialSummary> | null;
  fiscalYearLabel: string;
  canSeeExpenses: boolean;
  canSeeRevenue: boolean;
  canSeeReimbursements: boolean;
  canSeeEventBudgets: boolean;

  canSeeInventory: boolean;
  inventory: Unwrap<typeof getInventorySummary> | null;
  canSeeRecentDonations: boolean;
  recentDonations: EventDonationRow[];

  canSeeAccessManagement: boolean;
  accessManagementStats: Unwrap<typeof getAccessManagementStatsSummary> | null;

  canSeeOrganization: boolean;
  organization: Unwrap<typeof getOrganizationSummary> | null;
};
