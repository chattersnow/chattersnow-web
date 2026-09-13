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
import { DiscountCodesTab } from "./discount-codes-tab";
import { DonationsTab } from "./donations-tab";
import { DistributionsTab } from "./distributions-tab";
import { IncidentsTab } from "./incidents-tab";
import { ChecklistTab } from "./checklist-tab";
import { EventExpensesTab } from "./event-expenses-tab";
import { EventRevenueTab } from "./event-revenue-tab";
import { EventSalesTab } from "./event-sales-tab";
import { GiveawayTab } from "./giveaway-tab";
import { ReportTab } from "./report-tab";
import { ImpactTab } from "./impact-tab";
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
  | "discount-codes"
  | "distributions"
  | "incidents"
  | "giveaway"
  | "expenses"
  | "revenue"
  | "sales"
  | "report"
  | "impact"
  | "donations";

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
  phase: PhaseKey;
  kind: "form" | "plain";
  /**
   * What a reader needs before this card is rendered at all. Omitted means
   * `events:view`, which the route layout has already required, so most tabs
   * say nothing here.
   *
   * Four of them read another section's tables, and their server actions have
   * always said so -- listEventDonationsAction gates on `finance:view`,
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
    phase: "basic",
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
    value: "checklist",
    label: "Checklist",
    phase: "basic",
    kind: "plain",
    render: (ctx) => <ChecklistTab eventId={ctx.event.id} mode={ctx.mode} />,
    toolbarActions: (ctx) => (
      <AddChecklistItemDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
    ),
  },
  {
    value: "planning",
    label: "Planning",
    keywords: ["budget", "capacity", "lead", "registration", "deadline"],
    phase: "planning",
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
    value: "logistics",
    label: "Logistics",
    keywords: ["venue", "setup", "parking", "equipment", "load-in"],
    phase: "planning",
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
    value: "volunteers",
    label: "Volunteers",
    phase: "planning",
    kind: "plain",
    render: (ctx) => <VolunteersTab eventId={ctx.event.id} mode={ctx.mode} />,
    toolbarActions: (ctx) => (
      <>
        <AddShiftDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
        <AddVolunteerDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
        <LogHoursDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
      </>
    ),
  },
  {
    value: "staff",
    label: "Staff",
    phase: "planning",
    kind: "plain",
    render: (ctx) => <StaffTab eventId={ctx.event.id} mode={ctx.mode} />,
    toolbarActions: (ctx) => (
      <AddStaffDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
    ),
  },
  {
    value: "sponsors",
    label: "Sponsors",
    phase: "planning",
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
    value: "attendance",
    label: "Attendance",
    keywords: ["headcount", "turnout", "check-in"],
    phase: "during",
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
    value: "registrants",
    label: "Registrants",
    keywords: ["tickets", "rsvp", "sign-ups", "check-in"],
    phase: "during",
    kind: "plain",
    sharedData: ["registrants", "impactDerived"],
    render: (ctx) => (
      <RegistrantsTab
        capacity={ctx.event.capacity}
        mode={ctx.mode}
        registrants={ctx.shared.registrants}
        derived={ctx.shared.impactDerived}
        headerActions={
          ctx.mode === "edit" ? (
            <RegistrantsToolbar eventId={ctx.event.id} onSaved={ctx.onSaved} />
          ) : undefined
        }
      />
    ),
    toolbarActions: (ctx) => (
      <RegistrantsToolbar eventId={ctx.eventId} onSaved={ctx.onSaved} />
    ),
  },
  {
    value: "discount-codes",
    label: "Discount codes",
    phase: "during",
    kind: "plain",
    sharedData: ["registrants"],
    render: (ctx) => (
      <DiscountCodesTab
        eventId={ctx.event.id}
        mode={ctx.mode}
        registrants={ctx.shared.registrants}
      />
    ),
    toolbarActions: (ctx) => (
      <AddDiscountCodesDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
    ),
  },
  {
    value: "distributions",
    label: "Distributions",
    keywords: ["inventory", "supplies", "handed out"],
    phase: "during",
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
    value: "incidents",
    label: "Incidents",
    phase: "during",
    kind: "plain",
    render: (ctx) => <IncidentsTab eventId={ctx.event.id} mode={ctx.mode} />,
    toolbarActions: (ctx) => (
      <LogIncidentDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
    ),
  },
  {
    value: "giveaway",
    label: "Giveaway",
    keywords: ["raffle", "prizes", "tiers", "winners"],
    phase: "during",
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
    value: "report",
    label: "Report",
    keywords: ["debrief", "lessons learned", "feedback"],
    phase: "after",
    kind: "form",
    render: (ctx) => (
      <ReportTab
        ref={ctx.formCallbacks.report.registerHandle}
        event={ctx.event}
        formId={ctx.formId("report")}
        mode={ctx.mode}
        onSaved={ctx.onSaved}
        onPendingChange={ctx.formCallbacks.report.onPendingChange}
        onDirtyChange={ctx.formCallbacks.report.onDirtyChange}
      />
    ),
  },
  {
    value: "donations",
    label: "Donations",
    phase: "after",
    kind: "plain",
    access: [{ resource: "finance", level: "view" }],
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
    value: "expenses",
    label: "Expenses",
    phase: "after",
    kind: "plain",
    access: [{ resource: "event_expenses", level: "view" }],
    render: (ctx) => (
      <EventExpensesTab
        eventId={ctx.event.id}
        eventName={ctx.event.name}
        mode={ctx.mode}
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
    value: "revenue",
    label: "Revenue",
    phase: "after",
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
    value: "sales",
    label: "Sales",
    phase: "after",
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
    value: "impact",
    label: "Impact",
    keywords: ["outcomes", "metrics", "stories"],
    phase: "after",
    kind: "form",
    sharedData: ["impactDerived"],
    render: (ctx) => (
      <ImpactTab
        ref={ctx.formCallbacks.impact.registerHandle}
        eventId={ctx.event.id}
        formId={ctx.formId("impact")}
        derived={ctx.shared.impactDerived.data}
        mode={ctx.mode}
        onSaved={ctx.onSaved}
        onPendingChange={ctx.formCallbacks.impact.onPendingChange}
        onDirtyChange={ctx.formCallbacks.impact.onDirtyChange}
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

// Tabs that must revert to read-only once the event's report has been
// submitted, since submitted report data shouldn't shift underneath it.
export const LOCKED_ON_REPORT_SUBMIT_TABS: ReadonlySet<TabValue> = new Set([
  "overview",
  "planning",
  "report",
]);

/**
 * The rail's group headings (#1008). `basic` is called Overview because that is
 * what the group holds; it was "Basic" only to avoid colliding with the
 * Overview card back when the phase was a tab of its own.
 */
const PHASE_LABELS: Record<PhaseKey, string> = {
  basic: "Overview",
  planning: "Planning",
  during: "During",
  after: "After",
};

/**
 * Card titles that differ from the catalog label, so the rail row and the card
 * heading it opens always read the same. Both are ambiguous on their own:
 * "Overview" is also the group heading above it, and "Planning" is the group
 * as well as the card that carries registration settings.
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

export type EventPhase = {
  key: PhaseKey;
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
 * no cards drops out entirely -- nothing in the catalog makes that possible
 * today, every group holding at least one ungated events card, but a heading
 * with nothing under it would be worse than one heading fewer.
 *
 * Still keyed by phase after #1008 replaced the phase tabs with the rail: the
 * lifecycle is a real thing to group by, it just is not a thing to make the
 * reader select before they can see the card they want.
 */
export function eventPhases(permissions: PermissionMap): EventPhase[] {
  const order: PhaseKey[] = [];
  const tabsByPhase = new Map<PhaseKey, EventSection[]>();
  for (const entry of TAB_CONFIG) {
    if (!tabsByPhase.has(entry.phase)) {
      order.push(entry.phase);
      tabsByPhase.set(entry.phase, []);
    }
    if (entry.access && !hasAnyPermission(permissions, entry.access)) continue;
    tabsByPhase.get(entry.phase)!.push({
      value: entry.value,
      label: cardTitle(entry.value, entry.label),
      keywords: [...(entry.keywords ?? [])],
    });
  }
  return order
    .map((key) => ({
      key,
      label: PHASE_LABELS[key],
      tabs: tabsByPhase.get(key)!,
    }))
    .filter((phase) => phase.tabs.length > 0);
}

export function phaseForTab(tab: TabValue): PhaseKey {
  return TAB_CONFIG.find((entry) => entry.value === tab)!.phase;
}
