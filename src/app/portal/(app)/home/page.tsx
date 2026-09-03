import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DENIED_PARAM,
  getCurrentUserPermissions,
  hasPermission,
  hasAnyPermission,
} from "@/lib/auth/permissions";
import { resolveCurrentPersonId } from "@/lib/auth/current-person";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/portal/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActiveEventCard } from "./active-event-card";
import {
  DashboardEventRow,
  DashboardSectionCard,
  DashboardStatRow,
} from "./dashboard-section-card";
import {
  getUpcomingSummary,
  getFinancialSummary,
  getInventorySummary,
  getMyActiveEvents,
  getOrganizationSummary,
} from "./queries";
import { getAccessManagementStatsSummary } from "@/lib/portal/access-management/queries";
import { getEventTaskSummary } from "@/lib/portal/attention-items";
import { listRecentDonationsAction } from "./actions";
import {
  formatCalendarDate,
  formatCurrency,
  formatDateTime,
} from "@/lib/format";

// For plain `date` columns (e.g. grants.application_deadline) rather than
// timestamptz -- pinned to UTC so `new Date("2026-09-10")` (parsed as UTC
// midnight) doesn't roll back a day in timezones behind UTC.
const meetingTypeLabels: Record<string, string> = {
  board: "Board meeting",
  committee: "Committee meeting",
  annual: "Annual meeting",
  other: "Meeting",
};

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
      {children}
    </h2>
  );
}

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
  const canSeeRevenue = hasPermission(permissions, "event_revenue", "view");
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

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const startOfYear = new Date(startOfMonth.getFullYear(), 0, 1);

  const nowIso = new Date().toISOString();
  const todayDate = nowIso.slice(0, 10);
  const startOfMonthDate = startOfMonth.toISOString().slice(0, 10);
  const startOfYearDate = startOfYear.toISOString().slice(0, 10);

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
      ? getFinancialSummary(supabase, startOfMonthDate, startOfYearDate, nowIso)
      : Promise.resolve(null),
    canSeeInventory ? getInventorySummary(supabase) : Promise.resolve(null),
    canSeeAccessManagement
      ? getAccessManagementStatsSummary(supabase)
      : Promise.resolve(null),
    canSeeInventory && canSeeRecentDonations
      ? listRecentDonationsAction(5)
      : Promise.resolve(null),
    canSeeOrganization
      ? getOrganizationSummary(supabase, nowIso, todayDate)
      : Promise.resolve(null),
    resolveCurrentPersonId(supabase),
  ]);

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

  return (
    <section>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Dashboard
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      {deniedArea && (
        <Alert variant="destructive" className="mt-6">
          <ShieldAlert />
          <AlertTitle>
            {deniedArea === "That page"
              ? "You don't have access to that page"
              : `You don't have access to ${deniedArea}`}
          </AlertTitle>
          <AlertDescription>
            You were sent to the dashboard instead. If you need it for your
            work, ask an administrator to grant it.
          </AlertDescription>
        </Alert>
      )}

      {!anySectionVisible && (
        <Card className="mt-4">
          <CardContent>
            <EmptyState
              title="Nothing to show yet"
              description={
                <>
                  You&apos;re signed in, but none of your roles include a portal
                  section, so there is nothing for this dashboard to summarize.
                  An administrator can grant you a role from Administration
                  &rsaquo; Users; the sections that role can see will appear
                  here as soon as they do.
                </>
              }
            />
          </CardContent>
        </Card>
      )}

      {activeEvents.length > 0 && (
        <div className="mt-6">
          <SectionLabel>Happening now</SectionLabel>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {activeEvents.map((event) => (
              <ActiveEventCard
                key={event.id}
                event={event}
                canCheckIn={canCheckIn}
                canRecordDonation={canRecordDonation}
                canRecordDistribution={canRecordDistribution}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid items-start gap-x-6 lg:grid-cols-2">
        {canSeeUpcoming && upcoming && (
          <DashboardSectionCard className="lg:mt-6" title="Upcoming">
            <DashboardEventRow
              label="Next event"
              eventName={upcoming.nextEvent ? upcoming.nextEvent.name : "—"}
              caption={
                upcoming.nextEvent
                  ? `${formatDateTime(upcoming.nextEvent.starts_at)}${
                      upcoming.nextEvent.location
                        ? ` · ${upcoming.nextEvent.location}`
                        : ""
                    }`
                  : "No upcoming events"
              }
            />
            <DashboardStatRow
              label="Registrations"
              value={upcoming.registrationCount}
              caption="For upcoming events"
              href="/portal/events"
            />
            <DashboardStatRow
              label="Volunteers"
              value={upcoming.volunteerCount}
              caption="Assigned to upcoming events"
              href="/portal/events"
            />
            <DashboardStatRow
              label="Partners"
              value={upcoming.partnerCount}
              caption="Sponsoring upcoming events"
              href="/portal/events"
            />
            <DashboardStatRow
              label="Outstanding tasks"
              value={openTaskCount}
              caption={
                openTaskCount > 0
                  ? "Across draft and published events"
                  : "No open tasks."
              }
              href={openTaskCount > 0 ? "/portal/events?tasks=open" : undefined}
            />
          </DashboardSectionCard>
        )}

        {canSeeFinancial && financial && (
          <DashboardSectionCard className="lg:mt-6" title="Financial">
            <DashboardStatRow
              label="Cash position"
              value={formatCurrency(financial.cashPositionTotal)}
              caption="Income minus paid expenses, all time"
              href="/portal/finance/reports"
            />
            <DashboardStatRow
              label="Monthly income"
              href="/portal/finance/donations"
              value={formatCurrency(financial.incomeThisMonth)}
              caption={`This month · ${formatCurrency(financial.incomeThisYear)} this year`}
            />
            {canSeeExpenses && (
              <DashboardStatRow
                label="Expenses"
                href="/portal/finance/expenses"
                value={formatCurrency(financial.expensesThisMonth)}
                caption={`This month · ${formatCurrency(financial.expensesThisYear)} this year`}
              />
            )}
            {canSeeRevenue && (
              <DashboardStatRow
                label="Revenue"
                href="/portal/finance/revenue"
                value={formatCurrency(financial.revenueThisMonth)}
                caption={`This month · ${formatCurrency(financial.revenueThisYear)} this year`}
              />
            )}
            {canSeeReimbursements && (
              <DashboardStatRow
                label="Outstanding reimbursements"
                value={formatCurrency(financial.outstandingReimbursementTotal)}
                caption="Submitted or approved, not yet paid"
                // Deliberately unfiltered: this figure spans two statuses and
                // the list filters to one, so any single filter would show a
                // total that didn't match the number clicked.
                href="/portal/finance/reimbursements"
              />
            )}
            {canSeeEventBudgets && (
              <DashboardStatRow
                label="Event budgets"
                href="/portal/events"
                value={formatCurrency(financial.eventBudgetTotal)}
                caption="Published, upcoming events"
              />
            )}
          </DashboardSectionCard>
        )}

        {canSeeInventory && canSeeRecentDonations && (
          <Card className="lg:mt-6">
            <CardHeader>
              <CardTitle className="app-muted text-sm font-semibold">
                Recent donations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentDonations.length === 0 ? (
                <EmptyState
                  className="py-4"
                  title="No donations recorded yet"
                  description="Record the first gear donation from Inventory › Donations and it will show up here."
                  action={
                    <Button
                      variant="secondary"
                      nativeButton={false}
                      render={<Link href="/portal/inventory/donations" />}
                    >
                      Go to donations
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-border divide-y">
                  {recentDonations.map((donation) => (
                    <li
                      key={donation.id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span>
                        {donation.donor?.is_anonymous || !donation.donor?.name
                          ? "Anonymous"
                          : donation.donor.name}
                      </span>
                      <span className="app-muted">
                        {formatDateTime(donation.donated_at)} ·{" "}
                        {donation.inventory_items.length} item
                        {donation.inventory_items.length === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {canSeeAccessManagement && accessManagementStats && (
          <DashboardSectionCard className="lg:mt-6" title="Access management">
            <DashboardStatRow
              label="Active assets"
              href="/portal/administration/access-management"
              value={accessManagementStats.assetsCount}
            />
            <DashboardStatRow
              label="Active access grants"
              href="/portal/administration/access-management"
              value={accessManagementStats.activeGrantsCount}
            />
          </DashboardSectionCard>
        )}

        {canSeeInventory && inventory && (
          <DashboardSectionCard className="mt-6" title="Inventory">
            <DashboardStatRow
              label="Total items"
              href="/portal/inventory/items"
              value={inventory.totalItems}
            />
            <DashboardStatRow
              label="Available"
              href="/portal/inventory/items?status=available"
              value={inventory.itemsAvailable}
            />
            <DashboardStatRow
              label="Distributed"
              href="/portal/inventory/items?status=distributed"
              value={inventory.itemsDistributed}
            />
            <DashboardStatRow
              label="Needing attention"
              href="/portal/inventory/items"
              value={inventory.itemsNeedingAttention}
              caption="Damaged or lost"
            />
          </DashboardSectionCard>
        )}
        {canSeeOrganization && organization && (
          <DashboardSectionCard title="Organization">
            <DashboardEventRow
              label="Next meeting"
              eventName={
                organization.nextMeeting
                  ? (meetingTypeLabels[organization.nextMeeting.meeting_type] ??
                    "Meeting")
                  : "—"
              }
              caption={
                organization.nextMeeting
                  ? `${formatDateTime(organization.nextMeeting.meeting_date)}${
                      organization.nextMeeting.location
                        ? ` · ${organization.nextMeeting.location}`
                        : ""
                    }`
                  : "No meetings scheduled"
              }
            />
            <DashboardStatRow
              label="Compliance deadlines"
              href="/portal/governance/annual-requirements"
              value={organization.openRequirementCount}
              caption={
                organization.overdueRequirementCount > 0
                  ? `Open annual requirements · ${organization.overdueRequirementCount} overdue`
                  : "Open annual requirements"
              }
            />
            <DashboardStatRow
              label="Nonprofit status milestones"
              href="/portal/governance/nonprofit-status"
              value={organization.openMilestoneCount}
              caption={
                organization.overdueMilestoneCount > 0
                  ? `Not yet done · ${organization.overdueMilestoneCount} past due`
                  : "Not yet done"
              }
            />
            <DashboardStatRow
              label="Open action items"
              href="/portal/governance/meetings"
              value={organization.openActionItemCount}
              caption={
                organization.overdueActionItemCount > 0
                  ? `From meetings · ${organization.overdueActionItemCount} overdue`
                  : "From meetings"
              }
            />
            <DashboardStatRow
              label="Missing COI disclosures"
              href="/portal/governance/conflict-of-interest"
              value={organization.missingDisclosureCount}
              caption={`Active board members without a ${organization.disclosureYear} disclosure on file`}
            />
            <DashboardStatRow
              label="Partnership opportunities"
              value={organization.openPartnershipCount}
              caption="Open opportunities"
            />
            <DashboardEventRow
              label="Next grant deadline"
              eventName={
                organization.nextGrantDeadline
                  ? organization.nextGrantDeadline.funder_name
                  : "—"
              }
              caption={
                organization.nextGrantDeadline
                  ? `${formatCalendarDate(organization.nextGrantDeadline.application_deadline)}${
                      organization.overdueGrantCount > 0
                        ? ` · ${organization.overdueGrantCount} overdue`
                        : ""
                    }`
                  : organization.overdueGrantCount > 0
                    ? `${organization.overdueGrantCount} overdue`
                    : "No grant deadlines tracked"
              }
            />
          </DashboardSectionCard>
        )}
      </div>
    </section>
  );
}
