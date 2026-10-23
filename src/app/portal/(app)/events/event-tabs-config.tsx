import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  hasAnyPermission,
  type PermissionCheck,
  type PermissionMap,
} from "@/lib/auth/permissions";
import type { Program } from "../programs/actions";
import type { EventRow } from "./event-badges";
import type { PhaseKey } from "./phase-status";
import type { FormTabCallbacks } from "./use-form-tab-state";
import type { EventSharedData, SharedEventResource } from "./event-shared-data";
import { OverviewTab } from "./overview-tab";
import { PlanningTab } from "./planning-tab";
import { LogisticsTab } from "./logistics-tab";
import { VolunteersTab } from "./volunteers-tab";
import { SponsorsTab } from "./sponsors-tab";
import { StaffTab } from "./staff-tab";
import { AttendanceTab } from "./attendance-tab";
import { RegistrantsTab } from "./registrants-tab";
import { CarpoolsTab } from "./carpools-tab";
import { DiscountCodesTab } from "./discount-codes-tab";
import { DonationsTab } from "./donations-tab";
import { CashDonationsTab } from "./cash-donations-tab";
import { DistributionsTab } from "./distributions-tab";
import { IncidentsTab } from "./incidents-tab";
import { ChecklistTab } from "./checklist-tab";
import { EventExpensesTab } from "./event-expenses-tab";
import { EventRevenueTab } from "./event-revenue-tab";
import { EventSalesTab } from "./event-sales-tab";
import { GiveawayTab } from "./giveaway-tab";
import { ResultsTab } from "./results-tab";
import { MediaTab } from "./media-tab";
import { AddChecklistItemDialog } from "./add-checklist-item-dialog";
import { LogIncidentDialog } from "./log-incident-dialog";
import { AddDiscountCodesDialog } from "./add-discount-codes-dialog";
import { RegistrantsToolbar } from "./registrants-toolbar";
import { AddSponsorDialog } from "./add-sponsor-dialog";
import { AddStaffDialog } from "./add-staff-dialog";
import { AddShiftDialog } from "./volunteers/add-shift-dialog";
import { AddVolunteerDialog } from "./volunteers/add-volunteer-dialog";
import { LogHoursDialog } from "./volunteers/log-hours-dialog";
import { RecordDistributionModal } from "../home/record-distribution-modal";
import { AddDonationModal } from "../home/add-donation-modal";
import { NewExpenseDialog } from "../finance/expenses/new-expense-dialog";
import { NewRevenueDialog } from "../finance/revenue/new-revenue-dialog";

export const FORM_ID_PREFIX = "event-details-form";

export type Mode = "view" | "edit";

export type TabValue =
  | "overview"
  | "checklist"
  | "planning"
  | "logistics"
  | "volunteers"
  | "staff"
  | "sponsors"
  | "attendance"
  | "registrants"
  | "carpools"
  | "discount-codes"
  | "distributions"
  | "incidents"
  | "giveaway"
  | "expenses"
  | "revenue"
  | "sales"
  | "results"
  | "media"
  | "donations"
  | "cash-donations";

export type TabRenderContext = {
  event: EventRow;
  programs: Program[];
  mode: Mode;
  /** Reads the phase fetches once and shares them across its cards. */
  shared: EventSharedData;
  formId: (tabValue: TabValue) => string;
  onSaved: () => void;
  formCallbacks: Record<TabValue, FormTabCallbacks>;
};

export type ToolbarActionContext = {
  eventId: string;
  eventName: string;
  onSaved: () => void;
};

export type TabConfigEntry = {
  value: TabValue;
  label: string;
  group: EventGroupKey;
  kind: "form" | "plain";
  /**
   * What a reader needs before this card is rendered at all. Omitted means
   * `events:view`, which the route layout has already required, so most tabs
   * say nothing here.
   *
   * Four of them read another section's tables, and their server actions have
   * always said so -- listEventDonationsAction gates on `finance:view` or
   * inventory (#1572),
   * listEventDistributionsAction on inventory, and the expense and revenue
   * lists on `event_expenses` / `event_revenue`. Until #903 the cards were
   * rendered anyway and simply came back empty, which was already a poor
   * showing for an event coordinator with no finance access; with modules it
   * became a dead end, since `event_expenses` and `event_revenue` belong to
   * the Finance module (#900) and a tenant without Finance would still be
   * offered an Expenses card and an "Add expense" button that cannot work.
   *
   * Any of the checks passing is enough, like nav.ts's `access` and for the
   * same reason: the actions behind these cards use checkAnyPermission.
   */
  access?: readonly PermissionCheck[];
  /** Reads this card takes from the shared provider rather than fetching. */
  sharedData?: readonly SharedEventResource[];
  /**
   * Extra words the rail's search matches, for cards whose title is not what a
   * coordinator would type (#1008). "Budget" is on Registration & planning,
   * "raffle" is Giveaway, "venue" is Logistics -- and before the rail, finding
   * any of them meant already knowing which of four phases held the card.
   *
   * Lowercase, and only worth adding where the title does not already contain
   * the word.
   */
  keywords?: readonly string[];
  /**
   * A per-event switch the card is listed under (#1649): off, the event has
   * no such section at all, the way a card this reader may not see has none.
   */
  shownWhen?: keyof EventGroupOptions;
  render: (ctx: TabRenderContext) => ReactNode;
  /**
   * Create actions for this card, rendered in its own `CardHeader`. Only
   * `kind: "plain"` tabs may define these: an editable card spends its one
   * `CardAction` slot on the edit pencil.
   */
  toolbarActions?: (ctx: ToolbarActionContext) => ReactNode;
};

export const TAB_CONFIG: readonly TabConfigEntry[] = [
  {
    value: "overview",
    label: "Overview",
    group: "overview",
    kind: "form",
    render: (ctx) => (
      <OverviewTab
        ref={ctx.formCallbacks.overview.registerHandle}
        event={ctx.event}
        programs={ctx.programs}
        formId={ctx.formId("overview")}
        mode={ctx.mode}
        onSaved={ctx.onSaved}
        onPendingChange={ctx.formCallbacks.overview.onPendingChange}
        onDirtyChange={ctx.formCallbacks.overview.onDirtyChange}
      />
    ),
  },
  {
    value: "planning",
    label: "Planning",
    keywords: ["budget", "capacity", "lead", "registration", "deadline"],
    group: "overview",
    kind: "form",
    sharedData: ["people"],
    render: (ctx) => (
      <PlanningTab
        ref={ctx.formCallbacks.planning.registerHandle}
        event={ctx.event}
        formId={ctx.formId("planning")}
        people={ctx.shared.people.data ?? []}
        onPersonCreated={ctx.shared.addLocalPerson}
        mode={ctx.mode}
        onSaved={ctx.onSaved}
        onPendingChange={ctx.formCallbacks.planning.onPendingChange}
        onDirtyChange={ctx.formCallbacks.planning.onDirtyChange}
      />
    ),
  },
  {
    value: "checklist",
    label: "Checklist",
    group: "overview",
    kind: "plain",
    // The add dialog's owner picker.
    sharedData: ["people"],
    render: (ctx) => <ChecklistTab eventId={ctx.event.id} mode={ctx.mode} />,
    toolbarActions: (ctx) => (
      <AddChecklistItemDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
    ),
  },
  {
    value: "registrants",
    label: "Registrants",
    keywords: ["tickets", "rsvp", "sign-ups", "check-in"],
    group: "guests",
    kind: "plain",
    sharedData: ["registrants", "impactDerived"],
    render: (ctx) => (
      <RegistrantsTab
        eventId={ctx.event.id}
        eventName={ctx.event.name}
        capacity={ctx.event.capacity}
        mode={ctx.mode}
        registrants={ctx.shared.registrants}
        derived={ctx.shared.impactDerived}
      />
    ),
    toolbarActions: (ctx) => (
      <RegistrantsToolbar eventId={ctx.eventId} onSaved={ctx.onSaved} />
    ),
  },
  {
    // #1649. Only on an event with Organize carpools on; the board itself is
    // its own page, which this card links to.
    value: "carpools",
    label: "Carpools",
    keywords: ["rides", "drivers", "cars", "passengers", "transport"],
    group: "guests",
    kind: "plain",
    shownWhen: "carpoolsEnabled",
    sharedData: ["registrants"],
    render: (ctx) => (
      <CarpoolsTab
        eventId={ctx.event.id}
        registrants={ctx.shared.registrants}
      />
    ),
  },
  {
    value: "attendance",
    label: "Attendance",
    keywords: ["headcount", "turnout", "check-in"],
    group: "guests",
    kind: "plain",
    sharedData: ["impactDerived"],
    render: (ctx) => (
      <AttendanceTab
        event={ctx.event}
        mode={ctx.mode}
        derived={ctx.shared.impactDerived.data}
        onExitEdit={ctx.onSaved}
      />
    ),
  },
  {
    value: "discount-codes",
    label: "Discount codes",
    group: "guests",
    kind: "plain",
    sharedData: ["registrants"],
    render: (ctx) => (
      <DiscountCodesTab
        eventId={ctx.event.id}
        mode={ctx.mode}
        registrants={ctx.shared.registrants}
        refreshDerived={ctx.shared.impactDerived.refresh}
      />
    ),
    toolbarActions: (ctx) => (
      <AddDiscountCodesDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
    ),
  },
  {
    value: "staff",
    label: "Staff",
    group: "team",
    kind: "plain",
    render: (ctx) => <StaffTab eventId={ctx.event.id} mode={ctx.mode} />,
    toolbarActions: (ctx) => (
      <AddStaffDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
    ),
  },
  {
    value: "volunteers",
    label: "Volunteers",
    group: "team",
    kind: "plain",
    render: (ctx) => (
      <VolunteersTab
        eventId={ctx.event.id}
        mode={ctx.mode}
        refreshDerived={ctx.shared.impactDerived.refresh}
      />
    ),
    toolbarActions: (ctx) => (
      <>
        <AddShiftDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
        <AddVolunteerDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
        <LogHoursDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
      </>
    ),
  },
  {
    value: "sponsors",
    label: "Sponsors",
    group: "goods",
    kind: "plain",
    sharedData: ["people"],
    render: (ctx) => (
      <SponsorsTab
        eventId={ctx.event.id}
        people={ctx.shared.people.data ?? []}
        onPersonCreated={ctx.shared.addLocalPerson}
        mode={ctx.mode}
      />
    ),
    toolbarActions: (ctx) => (
      <AddSponsorDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
    ),
  },
  {
    value: "donations",
    label: "Donations",
    group: "goods",
    kind: "plain",
    // In-kind items, so inventory readers see them too (#1572).
    access: [
      { resource: "finance", level: "view" },
      { resource: "inventory", level: "manage" },
      { resource: "inventory_reports", level: "view" },
    ],
    render: (ctx) => <DonationsTab eventId={ctx.event.id} mode={ctx.mode} />,
    toolbarActions: (ctx) => (
      <AddDonationModal
        triggerLabel="Record donation for this event"
        eventId={ctx.eventId}
        onSaved={ctx.onSaved}
      />
    ),
  },
  {
    value: "giveaway",
    label: "Giveaway",
    keywords: ["raffle", "prizes", "tiers", "winners"],
    group: "goods",
    kind: "plain",
    sharedData: ["people"],
    render: (ctx) => (
      <GiveawayTab
        eventId={ctx.event.id}
        people={ctx.shared.people.data ?? []}
        onPersonCreated={ctx.shared.addLocalPerson}
        mode={ctx.mode}
        onExitEdit={ctx.onSaved}
      />
    ),
  },
  {
    value: "distributions",
    label: "Distributions",
    keywords: ["inventory", "supplies", "handed out"],
    group: "goods",
    kind: "plain",
    access: [
      { resource: "inventory", level: "manage" },
      { resource: "inventory_reports", level: "view" },
    ],
    render: (ctx) => (
      <DistributionsTab eventId={ctx.event.id} mode={ctx.mode} />
    ),
    toolbarActions: (ctx) => (
      <RecordDistributionModal
        eventId={ctx.eventId}
        triggerLabel="+ Record distribution"
        onSaved={ctx.onSaved}
      />
    ),
  },
  {
    value: "logistics",
    label: "Logistics",
    keywords: ["venue", "setup", "parking", "equipment", "load-in"],
    group: "operations",
    kind: "form",
    render: (ctx) => (
      <LogisticsTab
        ref={ctx.formCallbacks.logistics.registerHandle}
        eventId={ctx.event.id}
        formId={ctx.formId("logistics")}
        mode={ctx.mode}
        onSaved={ctx.onSaved}
        onPendingChange={ctx.formCallbacks.logistics.onPendingChange}
        onDirtyChange={ctx.formCallbacks.logistics.onDirtyChange}
      />
    ),
  },
  {
    value: "incidents",
    label: "Incidents",
    group: "operations",
    kind: "plain",
    render: (ctx) => <IncidentsTab eventId={ctx.event.id} mode={ctx.mode} />,
    toolbarActions: (ctx) => (
      <LogIncidentDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
    ),
  },
  {
    value: "sales",
    label: "Sales",
    group: "money",
    kind: "plain",
    // Gated like Expenses and Revenue beside it (#903): `sales` belongs to the
    // Finance module, so a tenant that was never sold Finance must not be
    // offered a Sales card and an "Open register" link that cannot work.
    access: [{ resource: "sales", level: "view" }],
    render: (ctx) => (
      <EventSalesTab
        eventId={ctx.event.id}
        eventName={ctx.event.name}
        mode={ctx.mode}
      />
    ),
    toolbarActions: (ctx) => (
      <Button
        variant="outline"
        size="sm"
        // A Link renders an <a>, and Base UI's Button logs a console error
        // unless it is told it is not rendering a native <button>.
        nativeButton={false}
        render={
          <Link href={`/portal/finance/sales/register?event=${ctx.eventId}`} />
        }
      >
        Open register
      </Button>
    ),
  },
  {
    value: "revenue",
    label: "Revenue",
    group: "money",
    kind: "plain",
    access: [{ resource: "event_revenue", level: "view" }],
    render: (ctx) => (
      <EventRevenueTab
        eventId={ctx.event.id}
        eventName={ctx.event.name}
        mode={ctx.mode}
      />
    ),
    toolbarActions: (ctx) => (
      <NewRevenueDialog
        events={[{ id: ctx.eventId, name: ctx.eventName }]}
        defaultEventId={ctx.eventId}
        lockEventSelection
        triggerLabel="New Revenue"
        onSaved={ctx.onSaved}
      />
    ),
  },
  {
    value: "cash-donations",
    label: "Cash donations",
    keywords: ["gifts", "money", "donors"],
    group: "money",
    kind: "plain",
    // Finance > Donations' own check: in-kind items have their own card in
    // Goods, readable by inventory too, but a cash gift is finance data.
    access: [{ resource: "finance", level: "view" }],
    render: (ctx) => (
      <CashDonationsTab eventId={ctx.event.id} mode={ctx.mode} />
    ),
  },
  {
    value: "expenses",
    label: "Expenses",
    group: "money",
    kind: "plain",
    access: [{ resource: "event_expenses", level: "view" }],
    render: (ctx) => (
      <EventExpensesTab
        eventId={ctx.event.id}
        eventName={ctx.event.name}
        budgetAmount={ctx.event.budget_amount}
        mode={ctx.mode}
        refreshDerived={ctx.shared.impactDerived.refresh}
      />
    ),
    toolbarActions: (ctx) => (
      <NewExpenseDialog
        events={[{ id: ctx.eventId, name: ctx.eventName }]}
        defaultEventId={ctx.eventId}
        lockEventSelection
        triggerLabel="New Expense"
        onSaved={ctx.onSaved}
      />
    ),
  },
  {
    // Report and Impact merged (#1588). `?tab=report` and `?tab=impact`
    // links still land here, through LEGACY_TAB_VALUES.
    value: "results",
    label: "Results",
    keywords: [
      "report",
      "impact",
      "outcomes",
      "metrics",
      "stories",
      "debrief",
      "retro",
      "lessons learned",
      "action items",
      "feedback",
    ],
    group: "results",
    kind: "form",
    // The route layout already requires events:view; event_impact:view is
    // named so the card's audience is said in one place. Each section inside
    // is gated by its own permission or module.
    access: [
      { resource: "events", level: "view" },
      { resource: "event_impact", level: "view" },
    ],
    sharedData: ["impactDerived"],
    render: (ctx) => (
      <ResultsTab
        ref={ctx.formCallbacks.results.registerHandle}
        event={ctx.event}
        derived={ctx.shared.impactDerived.data}
        formId={ctx.formId("results")}
        mode={ctx.mode}
        onSaved={ctx.onSaved}
        onPendingChange={ctx.formCallbacks.results.onPendingChange}
        onDirtyChange={ctx.formCallbacks.results.onDirtyChange}
      />
    ),
  },
  {
    // Photos and videos taken at the event (#1606). Ungated beyond the route's
    // events:view; the upload control inside checks who may upload.
    value: "media",
    label: "Media",
    keywords: ["photos", "videos", "pictures", "footage", "gallery"],
    group: "results",
    kind: "plain",
    render: (ctx) => (
      <MediaTab
        eventId={ctx.event.id}
        eventName={ctx.event.name}
        eventStartsAt={ctx.event.starts_at}
        eventEndsAt={ctx.event.ends_at}
        timeZone={ctx.event.timezone}
      />
    ),
  },
] as const;

export const FORM_TAB_VALUES: TabValue[] = TAB_CONFIG.filter(
  (t) => t.kind === "form",
).map((t) => t.value);

const TAB_VALUE_SET: ReadonlySet<TabValue> = new Set(
  TAB_CONFIG.map((entry) => entry.value),
);

export function isTabValue(value: string | undefined): value is TabValue {
  return !!value && TAB_VALUE_SET.has(value as TabValue);
}

/**
 * Cards that were merged into another, and where a link to them lands now:
 * Report and Impact became Results (#1588).
 */
export const LEGACY_TAB_VALUES: Readonly<Record<string, TabValue>> = {
  report: "results",
  impact: "results",
};

// Tabs that must revert to read-only once the event's report has been
// submitted, since submitted report data shouldn't shift underneath it. Results
// is one card since #1588, so this locks its Outcomes and notes too.
export const LOCKED_ON_REPORT_SUBMIT_TABS: ReadonlySet<TabValue> = new Set([
  "overview",
  "planning",
  "results",
]);

/**
 * The rail's groups, in the order it lists them (#1571).
 *
 * By what a card is about rather than when it is used. #1008 kept the
 * lifecycle phases as headings, but most cards do not belong to one moment:
 * donations, sales and revenue come in during the event and after it,
 * registrants and discount codes matter before it, and incidents can happen at
 * setup -- so a coordinator had to guess which phase held the card. Goods
 * follows items through the event: sponsors mostly give in kind, donations are
 * mostly in kind and land in inventory, giveaway prizes reserve inventory, and
 * distributions hand it out.
 *
 * The lifecycle still exists where it means something, in `phase-status.ts`'s
 * outstanding tasks.
 */
export const EVENT_GROUPS = [
  { key: "overview", label: "Overview" },
  { key: "guests", label: "Guests" },
  { key: "team", label: "Team" },
  { key: "goods", label: "Goods" },
  { key: "operations", label: "Operations" },
  { key: "money", label: "Money" },
  { key: "results", label: "Results" },
] as const;

export type EventGroupKey = (typeof EVENT_GROUPS)[number]["key"];

/**
 * Where a `?phase=` link from before the rail lands (#958's phase tabs, read
 * since #1008): the card each phase used to open on.
 */
export const LEGACY_PHASE_CARDS: Record<PhaseKey, TabValue> = {
  basic: "overview",
  planning: "planning",
  during: "attendance",
  after: "results",
};

/**
 * Card titles that differ from the catalog label, so the rail row and the card
 * heading it opens always read the same. "Overview" is also the group heading
 * above it, and "Planning" alone would not say the card carries registration
 * settings.
 */
export const CARD_TITLES: Partial<Record<TabValue, string>> = {
  overview: "Event details",
  planning: "Registration & planning",
};

export function cardTitle(value: TabValue, label: string): string {
  return CARD_TITLES[value] ?? label;
}

export type EventSection = {
  value: TabValue;
  /** The display title -- `CARD_TITLES` already applied. */
  label: string;
  /** Extra words the rail's search matches. */
  keywords: string[];
};

export type EventGroup = {
  key: EventGroupKey;
  label: string;
  tabs: EventSection[];
};

/**
 * The rail's groups and their cards, for one reader.
 *
 * A function of the permission map rather than a module constant since #903:
 * a card whose `access` this reader does not hold is not rendered, so the
 * Expenses and Revenue cards disappear along with the Finance module instead
 * of standing there empty above a button that cannot save. A group left with
 * no cards drops out entirely -- Money does, for a tenant without Finance --
 * since a heading with nothing under it would be worse than one heading fewer.
 */
export type EventGroupOptions = {
  /** `events.carpools_enabled` (#1649). */
  carpoolsEnabled?: boolean;
};

export function eventGroups(
  permissions: PermissionMap,
  options: EventGroupOptions = {},
): EventGroup[] {
  return EVENT_GROUPS.map(({ key, label }) => ({
    key,
    label,
    tabs: TAB_CONFIG.filter(
      (entry) =>
        entry.group === key &&
        (!entry.access || hasAnyPermission(permissions, entry.access)) &&
        (!entry.shownWhen || options[entry.shownWhen] === true),
    ).map((entry) => ({
      value: entry.value,
      label: cardTitle(entry.value, entry.label),
      keywords: [...(entry.keywords ?? [])],
    })),
  })).filter((group) => group.tabs.length > 0);
}
