import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
  hasAnyPermission,
} from "@/lib/auth/permissions";
import { resolveCurrentPersonId } from "@/lib/auth/current-person";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActiveEventCard } from "./active-event-card";
import {
  DashboardEventRow,
  DashboardSectionCard,
  DashboardStatRow,
  DashboardTaskListRow,
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

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

// For plain `date` columns (e.g. grants.application_deadline) rather than
// timestamptz -- pinned to UTC so `new Date("2026-09-10")` (parsed as UTC
// midnight) doesn't roll back a day in timezones behind UTC.
const dateOnlyFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

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

export default async function PortalHomePage() {
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

      {!anySectionVisible && (
        <Card className="mt-4">
          <CardContent className="pt-6">
            <p className="app-muted text-sm">
              Your activity summary will appear here as volunteer participation
              tracking is added.
            </p>
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
                  ? `${dateFormatter.format(new Date(upcoming.nextEvent.starts_at))}${
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
            />
            <DashboardStatRow
              label="Volunteers"
              value={upcoming.volunteerCount}
              caption="Assigned to upcoming events"
            />
            <DashboardStatRow
              label="Partners"
              value={upcoming.partnerCount}
              caption="Sponsoring upcoming events"
            />
            <DashboardTaskListRow
              label="Outstanding tasks"
              items={eventTasks?.items ?? []}
              emptyCaption="No open tasks across upcoming events."
            />
          </DashboardSectionCard>
        )}

        {canSeeFinancial && financial && (
          <DashboardSectionCard className="lg:mt-6" title="Financial">
            <DashboardStatRow
              label="Cash position"
              value={currencyFormatter.format(financial.cashPositionTotal)}
              caption="Income minus paid expenses, all time"
            />
            <DashboardStatRow
              label="Monthly income"
              value={currencyFormatter.format(financial.incomeThisMonth)}
              caption={`This month · ${currencyFormatter.format(financial.incomeThisYear)} this year`}
            />
            {canSeeExpenses && (
              <DashboardStatRow
                label="Expenses"
                value={currencyFormatter.format(financial.expensesThisMonth)}
                caption={`This month · ${currencyFormatter.format(financial.expensesThisYear)} this year`}
              />
            )}
            {canSeeRevenue && (
              <DashboardStatRow
                label="Revenue"
                value={currencyFormatter.format(financial.revenueThisMonth)}
                caption={`This month · ${currencyFormatter.format(financial.revenueThisYear)} this year`}
              />
            )}
            {canSeeReimbursements && (
              <DashboardStatRow
                label="Outstanding reimbursements"
                value={currencyFormatter.format(
                  financial.outstandingReimbursementTotal,
                )}
                caption="Submitted or approved, not yet paid"
              />
            )}
            {canSeeEventBudgets && (
              <DashboardStatRow
                label="Event budgets"
                value={currencyFormatter.format(financial.eventBudgetTotal)}
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
                <p className="app-muted text-sm">No donations recorded yet.</p>
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
                        {dateFormatter.format(new Date(donation.donated_at))} ·{" "}
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
              value={accessManagementStats.assetsCount}
            />
            <DashboardStatRow
              label="Active access grants"
              value={accessManagementStats.activeGrantsCount}
            />
          </DashboardSectionCard>
        )}

        {canSeeInventory && inventory && (
          <DashboardSectionCard className="mt-6" title="Inventory">
            <DashboardStatRow
              label="Total items"
              value={inventory.totalItems}
            />
            <DashboardStatRow
              label="Available"
              value={inventory.itemsAvailable}
            />
            <DashboardStatRow
              label="Distributed"
              value={inventory.itemsDistributed}
            />
            <DashboardStatRow
              label="Needing attention"
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
                  ? `${dateFormatter.format(new Date(organization.nextMeeting.meeting_date))}${
                      organization.nextMeeting.location
                        ? ` · ${organization.nextMeeting.location}`
                        : ""
                    }`
                  : "No meetings scheduled"
              }
            />
            <DashboardStatRow
              label="Compliance deadlines"
              value={organization.openRequirementCount}
              caption={
                organization.overdueRequirementCount > 0
                  ? `Open annual requirements · ${organization.overdueRequirementCount} overdue`
                  : "Open annual requirements"
              }
            />
            <DashboardStatRow
              label="Nonprofit status milestones"
              value={organization.openMilestoneCount}
              caption={
                organization.overdueMilestoneCount > 0
                  ? `Not yet done · ${organization.overdueMilestoneCount} past due`
                  : "Not yet done"
              }
            />
            <DashboardStatRow
              label="Open action items"
              value={organization.openActionItemCount}
              caption={
                organization.overdueActionItemCount > 0
                  ? `From meetings · ${organization.overdueActionItemCount} overdue`
                  : "From meetings"
              }
            />
            <DashboardStatRow
              label="Missing COI disclosures"
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
                  ? `${dateOnlyFormatter.format(new Date(organization.nextGrantDeadline.application_deadline))}${
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
