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
  DashboardComingSoonRow,
  DashboardEventRow,
  DashboardSectionCard,
  DashboardStatRow,
} from "./dashboard-section-card";
import {
  getUpcomingSummary,
  getFinancialSummary,
  getInventorySummary,
  getMyActiveEvents,
} from "./queries";
import { getAccessManagementStatsSummary } from "@/lib/portal/access-management/queries";
import { listRecentDonationsAction } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

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
  const canSeeOrganization = hasPermission(permissions, "governance", "manage");
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
  const startOfMonthDate = startOfMonth.toISOString().slice(0, 10);
  const startOfYearDate = startOfYear.toISOString().slice(0, 10);

  const [
    upcoming,
    financial,
    inventory,
    accessManagementStats,
    recentDonationsResult,
    personId,
  ] = await Promise.all([
    canSeeUpcoming
      ? getUpcomingSummary(supabase, nowIso)
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
        <div className="rainbow-accent mb-2 w-full" />
        <p className="app-muted text-sm font-semibold uppercase tracking-[0.16em]">
          Dashboard
        </p>
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
            <DashboardComingSoonRow
              label="Outstanding tasks"
              description="Event checklists and tasks aren't tracked yet."
            />
          </DashboardSectionCard>
        )}

        {canSeeFinancial && financial && (
          <DashboardSectionCard className="lg:mt-6" title="Financial">
            <DashboardComingSoonRow
              label="Cash position & monthly income"
              description="Only in-kind donations are tracked today; monetary donation tracking isn't built yet."
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

        {canSeeInventory && inventory && (
          <DashboardSectionCard className="lg:mt-6" title="Inventory">
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

        {canSeeInventory && canSeeRecentDonations && (
          <Card className="mt-6">
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
      </div>

      {canSeeOrganization && (
        <DashboardSectionCard title="Organization">
          <DashboardComingSoonRow
            label="Organization health"
            description="This area will surface organization-wide health: upcoming compliance deadlines, partnership opportunities, grant deadlines, and governance tasks."
          />
        </DashboardSectionCard>
      )}
    </section>
  );
}
