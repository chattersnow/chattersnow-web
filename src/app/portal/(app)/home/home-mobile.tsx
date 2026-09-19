import Link from "next/link";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/portal/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { ActiveEventCard } from "./active-event-card";
import { AttentionList } from "./attention-list";
import { SectionLabel } from "./dashboard-chrome";
import type { DashboardData } from "./dashboard-data";

/**
 * The dashboard a phone gets (#1079).
 *
 * Not the desktop dashboard reordered. It answers, above the fold, the two
 * questions someone standing at an event opens the portal to ask -- what needs
 * me now, and what can I do about the event I am at -- and files the reference
 * material underneath, where reference material belongs on a 390px screen.
 *
 * The stat tiles and the financial and organization summaries are not phone
 * work: they are numbers to read at a desk. They collapse to one summary line
 * each, each a link to the page that holds the real figures.
 */
export function HomeMobile({
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
  canSeeInventory,
  inventory,
  canSeeOrganization,
  organization,
}: DashboardData) {
  return (
    <section>
      <h1 className="brand-display text-3xl font-semibold tracking-brand">
        Dashboard
      </h1>
      <div className="rainbow-accent mt-2 w-24" />

      {deniedArea && (
        <Alert variant="destructive" className="mt-4">
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

      {/* First, because it is the reason the portal got opened. The same items
          the header's bell holds, as a list that can be acted on rather than a
          count that has to be tapped to be read. */}
      {anySectionVisible && (
        <div className="mt-6">
          <SectionLabel>Needs you</SectionLabel>
          <AttentionList />
        </div>
      )}

      {/* Second: check-in and record-a-donation are one tap from here, which is
          the whole job this shell exists for. */}
      {activeEvents.length > 0 && (
        <div className="mt-6">
          <SectionLabel>Happening now</SectionLabel>
          <div className="mt-3 grid gap-4">
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

      {/* Everything below is reference material: one line each, each a door to
          the page that holds the detail. */}
      {(canSeeUpcoming ||
        canSeeFinancial ||
        canSeeInventory ||
        canSeeOrganization) && (
        <div className="mt-8">
          <SectionLabel>Summary</SectionLabel>
          <ul className="mt-3 divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
            {canSeeUpcoming && upcoming && (
              <SummaryRow
                href="/portal/events"
                label="Next event"
                value={upcoming.nextEvent ? upcoming.nextEvent.name : "None"}
              />
            )}
            {canSeeUpcoming && (
              <SummaryRow
                href={
                  openTaskCount > 0 ? "/portal/events?tasks=open" : undefined
                }
                label="Outstanding event tasks"
                value={String(openTaskCount)}
              />
            )}
            {canSeeFinancial && financial && (
              <SummaryRow
                href="/portal/finance/reports"
                label="Cash position"
                value={formatCurrency(financial.cashPositionTotal)}
              />
            )}
            {canSeeInventory && inventory && (
              <SummaryRow
                href="/portal/inventory/items?status=available"
                label={`${lexicon.collection} available`}
                value={String(inventory.itemsAvailable)}
              />
            )}
            {canSeeOrganization && organization && (
              <SummaryRow
                href="/portal/governance/annual-requirements"
                label="Open compliance deadlines"
                value={String(organization.openRequirementCount)}
              />
            )}
          </ul>
        </div>
      )}
    </section>
  );
}

function SummaryRow({
  href,
  label,
  value,
}: {
  href?: string;
  label: string;
  value: string;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      {/* Never `shrink-0`: these values are tenant content -- an event's name
          among them -- so one long enough cannot be allowed to set the row's
          width. It did, and because nothing above it constrains the page, the
          whole document grew past the viewport and the reader had to zoom out
          to read anything (#1079). Capped at just over half the row so the
          label keeps a readable share, and truncating past that. */}
      <span className="min-w-0 max-w-[55%] truncate text-sm font-semibold">
        {value}
      </span>
    </>
  );

  // A row with nowhere to go stays a row rather than becoming a link that
  // does nothing when tapped.
  if (!href) {
    return (
      <li className="flex min-h-12 items-center gap-3 px-3 py-2">
        {body}
        <span className="size-4 shrink-0" aria-hidden />
      </li>
    );
  }

  return (
    <li>
      <Link href={href} className="flex min-h-12 items-center gap-3 px-3 py-2">
        {body}
        <ChevronRight className="app-muted size-4 shrink-0" aria-hidden />
      </Link>
    </li>
  );
}
