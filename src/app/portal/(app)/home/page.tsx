import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
  hasAnyPermission,
} from "@/lib/auth/permissions";
import { resolveCurrentPersonId } from "@/lib/auth/current-person";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile, ComingSoonTile, AttentionTile } from "./stat-tile";
import { ActiveEventCard } from "./active-event-card";
import {
  getUpcomingSummary,
  getFinancialSummary,
  getInventorySummary,
  getPendingApprovalsSummary,
  getContentWorkSummary,
  getMyActiveEvents,
} from "./queries";
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
  const canSeeEventBudgets = canSeeUpcoming;
  const canSeeRecentDonations = hasPermission(permissions, "finance", "view");
  const canSeeInventory = hasAnyPermission(permissions, [
    { resource: "inventory", level: "manage" },
    { resource: "inventory_reports", level: "view" },
  ]);
  const canSeeOrganization = hasPermission(permissions, "governance", "manage");
  const canSeeExpenseApprovals = hasPermission(
    permissions,
    "finance_approvals",
    "manage",
  );
  const canSeeContentCalendar = hasPermission(
    permissions,
    "content_calendar",
    "view",
  );
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
    recentDonationsResult,
    pendingApprovals,
    personId,
    { data: userData },
  ] = await Promise.all([
    canSeeUpcoming
      ? getUpcomingSummary(supabase, nowIso)
      : Promise.resolve(null),
    canSeeFinancial
      ? getFinancialSummary(supabase, startOfMonthDate, startOfYearDate, nowIso)
      : Promise.resolve(null),
    canSeeInventory ? getInventorySummary(supabase) : Promise.resolve(null),
    canSeeInventory && canSeeRecentDonations
      ? listRecentDonationsAction(5)
      : Promise.resolve(null),
    canSeeExpenseApprovals
      ? getPendingApprovalsSummary(supabase, { canSeeExpenseApprovals })
      : Promise.resolve(null),
    resolveCurrentPersonId(supabase),
    supabase.auth.getUser(),
  ]);

  const contentWork = canSeeContentCalendar
    ? await getContentWorkSummary(supabase, {
        canSeeContentCalendar,
        userId: userData.user?.id ?? null,
      })
    : null;

  const recentDonations =
    recentDonationsResult && "data" in recentDonationsResult
      ? recentDonationsResult.data
      : [];
  const attentionItems = [
    ...(pendingApprovals?.items ?? []),
    ...(contentWork?.items ?? []),
  ];
  const activeEvents = personId
    ? await getMyActiveEvents(supabase, personId, nowIso)
    : [];

  const anySectionVisible =
    canSeeUpcoming ||
    canSeeFinancial ||
    canSeeInventory ||
    canSeeOrganization ||
    activeEvents.length > 0;

  return (
    <section>
      <p className="app-muted text-sm font-semibold uppercase tracking-[0.16em]">
        Overview
      </p>

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
                canRecordDonation={canRecordDonation}
                canRecordDistribution={canRecordDistribution}
              />
            ))}
          </div>
        </div>
      )}

      {attentionItems.length > 0 && (
        <div className="mt-6">
          <SectionLabel>Needs your attention</SectionLabel>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {attentionItems.map((item) => (
              <AttentionTile
                key={item.key}
                label={item.label}
                count={item.count}
                href={item.href}
              />
            ))}
          </div>
        </div>
      )}

      {canSeeUpcoming && upcoming && (
        <div className="mt-6">
          <SectionLabel>Upcoming</SectionLabel>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Next event"
              value={upcoming.nextEvent ? upcoming.nextEvent.name : "—"}
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
            <StatTile
              label="Registrations"
              value={upcoming.registrationCount}
              caption="For upcoming events"
            />
            <StatTile
              label="Volunteers"
              value={upcoming.volunteerCount}
              caption="Assigned to upcoming events"
            />
            <StatTile
              label="Partners"
              value={upcoming.partnerCount}
              caption="Sponsoring upcoming events"
            />
            <ComingSoonTile
              label="Outstanding tasks"
              description="Event checklists and tasks aren't tracked yet."
            />
          </div>
        </div>
      )}

      {canSeeFinancial && financial && (
        <div className="mt-6">
          <SectionLabel>Financial</SectionLabel>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ComingSoonTile
              label="Cash position & monthly income"
              description="Only in-kind donations are tracked today; monetary donation tracking isn't built yet."
            />
            {canSeeExpenses && (
              <StatTile
                label="Expenses"
                value={currencyFormatter.format(financial.expensesThisMonth)}
                caption={`This month · ${currencyFormatter.format(financial.expensesThisYear)} this year`}
              />
            )}
            <ComingSoonTile
              label="Outstanding reimbursements"
              description="Reimbursement tracking is planned in issue #51."
            />
            {canSeeEventBudgets && (
              <StatTile
                label="Event budgets"
                value={currencyFormatter.format(financial.eventBudgetTotal)}
                caption="Published, upcoming events"
              />
            )}
          </div>
        </div>
      )}

      {canSeeInventory && inventory && (
        <div className="mt-6">
          <SectionLabel>Inventory</SectionLabel>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Total items" value={inventory.totalItems} />
            <StatTile label="Available" value={inventory.itemsAvailable} />
            <StatTile label="Distributed" value={inventory.itemsDistributed} />
            <StatTile
              label="Needing attention"
              value={inventory.itemsNeedingAttention}
              caption="Damaged or lost"
            />
          </div>
          {canSeeRecentDonations && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="app-muted text-sm font-semibold">
                  Recent donations
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentDonations.length === 0 ? (
                  <p className="app-muted text-sm">
                    No donations recorded yet.
                  </p>
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
                          {dateFormatter.format(new Date(donation.donated_at))}{" "}
                          · {donation.inventory_items.length} item
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
      )}

      {canSeeOrganization && (
        <div className="mt-6">
          <SectionLabel>Organization</SectionLabel>
          <Card className="mt-3">
            <CardHeader>
              <CardTitle>Coming soon</CardTitle>
            </CardHeader>
            <CardContent className="app-muted text-sm">
              This area will surface organization-wide health: upcoming
              compliance deadlines, partnership opportunities, grant deadlines,
              and governance tasks.
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
