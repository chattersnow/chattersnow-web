import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/portal/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCalendarDate, formatCurrency } from "@/lib/format";
import { formatFiscalYearLabel } from "@/lib/fiscal-year";
import { ViewerTime } from "@/components/viewer-time";
import { ActiveEventCard } from "./active-event-card";
import {
  DashboardEventRow,
  DashboardSectionCard,
  DashboardStatRow,
} from "./dashboard-section-card";
import { meetingTypeLabels, SectionLabel } from "./dashboard-chrome";
import type { DashboardData } from "./dashboard-data";

/**
 * The dashboard a desktop request has always had (#1079): two columns of
 * reference cards, in the order they have always been in. Moved out of
 * `page.tsx` unchanged when the mobile dashboard arrived.
 */
export function HomeDesktop({
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
}: DashboardData) {
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
                upcoming.nextEvent ? (
                  <>
                    <ViewerTime
                      iso={upcoming.nextEvent.starts_at}
                      fallbackZone="UTC"
                    />
                    {upcoming.nextEvent.location
                      ? ` · ${upcoming.nextEvent.location}`
                      : ""}
                  </>
                ) : (
                  "No upcoming events"
                )
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
              caption={`This month · ${formatCurrency(financial.incomeThisYear)} ${fiscalYearLabel}`}
            />
            {canSeeExpenses && (
              <DashboardStatRow
                label="Expenses"
                href="/portal/finance/expenses"
                value={formatCurrency(financial.expensesThisMonth)}
                caption={`This month · ${formatCurrency(financial.expensesThisYear)} ${fiscalYearLabel}`}
              />
            )}
            {canSeeRevenue && (
              <DashboardStatRow
                label="Revenue and sales"
                href="/portal/finance/revenue"
                value={formatCurrency(financial.revenueThisMonth)}
                caption={`This month · ${formatCurrency(financial.revenueThisYear)} ${fiscalYearLabel}`}
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
                        {formatCalendarDate(donation.donated_at)} ·{" "}
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
          <DashboardSectionCard className="lg:mt-6" title="Technology">
            <DashboardStatRow
              label="Active assets"
              href="/portal/technology"
              value={accessManagementStats.assetsCount}
            />
            <DashboardStatRow
              label="Active access grants"
              href="/portal/technology"
              value={accessManagementStats.activeGrantsCount}
            />
          </DashboardSectionCard>
        )}

        {canSeeInventory && inventory && (
          <DashboardSectionCard className="mt-6" title={lexicon.collection}>
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
                organization.nextMeeting ? (
                  <>
                    <ViewerTime
                      iso={organization.nextMeeting.meeting_date}
                      fallbackZone="UTC"
                    />
                    {organization.nextMeeting.location
                      ? ` · ${organization.nextMeeting.location}`
                      : ""}
                  </>
                ) : (
                  "No meetings scheduled"
                )
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
              caption={`Active board members with no ${formatFiscalYearLabel(organization.disclosureYear)} disclosure on file`}
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
