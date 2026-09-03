import type { ReactNode } from "react";
import type { Program } from "../programs/actions";
import type { EventRow } from "./event-badges";
import type { PhaseKey } from "./phase-status";
import type { FormTabCallbacks } from "./use-form-tab-state";
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
import { GiveawayTab } from "./giveaway-tab";
import { ReportTab } from "./report-tab";
import { ImpactTab } from "./impact-tab";
import { AddChecklistItemDialog } from "./add-checklist-item-dialog";
import { LogIncidentDialog } from "./log-incident-dialog";
import { AddDiscountCodesDialog } from "./add-discount-codes-dialog";
import { CheckInWalkInDialog } from "./check-in-walkin-dialog";
import { AddRegistrantDialog } from "./add-registrant-dialog";
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
  | "report"
  | "impact"
  | "donations";

export type TabRenderContext = {
  event: EventRow;
  programs: Program[];
  mode: Mode;
  activeTab: TabValue;
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
  render: (ctx: TabRenderContext) => ReactNode;
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
    render: (ctx) => (
      <ChecklistTab
        eventId={ctx.event.id}
        active={ctx.activeTab === "checklist"}
        mode={ctx.mode}
      />
    ),
    toolbarActions: (ctx) => (
      <AddChecklistItemDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
    ),
  },
  {
    value: "planning",
    label: "Planning",
    phase: "planning",
    kind: "form",
    render: (ctx) => (
      <PlanningTab
        ref={ctx.formCallbacks.planning.registerHandle}
        event={ctx.event}
        formId={ctx.formId("planning")}
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
    phase: "planning",
    kind: "form",
    render: (ctx) => (
      <LogisticsTab
        ref={ctx.formCallbacks.logistics.registerHandle}
        eventId={ctx.event.id}
        formId={ctx.formId("logistics")}
        active={ctx.activeTab === "logistics"}
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
    render: (ctx) => (
      <VolunteersTab
        eventId={ctx.event.id}
        active={ctx.activeTab === "volunteers"}
        mode={ctx.mode}
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
    value: "staff",
    label: "Staff",
    phase: "planning",
    kind: "plain",
    render: (ctx) => (
      <StaffTab
        eventId={ctx.event.id}
        active={ctx.activeTab === "staff"}
        mode={ctx.mode}
      />
    ),
    toolbarActions: (ctx) => (
      <AddStaffDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
    ),
  },
  {
    value: "sponsors",
    label: "Sponsors",
    phase: "planning",
    kind: "plain",
    render: (ctx) => (
      <SponsorsTab
        eventId={ctx.event.id}
        active={ctx.activeTab === "sponsors"}
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
    phase: "during",
    kind: "plain",
    render: (ctx) => (
      <AttendanceTab
        event={ctx.event}
        mode={ctx.mode}
        active={ctx.activeTab === "attendance"}
        onExitEdit={ctx.onSaved}
      />
    ),
  },
  {
    value: "registrants",
    label: "Registrants",
    phase: "during",
    kind: "plain",
    render: (ctx) => (
      <RegistrantsTab
        eventId={ctx.event.id}
        capacity={ctx.event.capacity}
        active={ctx.activeTab === "registrants"}
        mode={ctx.mode}
      />
    ),
    toolbarActions: (ctx) => (
      <>
        <AddRegistrantDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
        <CheckInWalkInDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
      </>
    ),
  },
  {
    value: "discount-codes",
    label: "Discount codes",
    phase: "during",
    kind: "plain",
    render: (ctx) => (
      <DiscountCodesTab
        eventId={ctx.event.id}
        active={ctx.activeTab === "discount-codes"}
        mode={ctx.mode}
      />
    ),
    toolbarActions: (ctx) => (
      <AddDiscountCodesDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
    ),
  },
  {
    value: "distributions",
    label: "Distributions",
    phase: "during",
    kind: "plain",
    render: (ctx) => (
      <DistributionsTab
        eventId={ctx.event.id}
        active={ctx.activeTab === "distributions"}
        mode={ctx.mode}
      />
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
    render: (ctx) => (
      <IncidentsTab
        eventId={ctx.event.id}
        active={ctx.activeTab === "incidents"}
        mode={ctx.mode}
      />
    ),
    toolbarActions: (ctx) => (
      <LogIncidentDialog eventId={ctx.eventId} onSaved={ctx.onSaved} />
    ),
  },
  {
    value: "giveaway",
    label: "Giveaway",
    phase: "during",
    kind: "plain",
    render: (ctx) => (
      <GiveawayTab
        eventId={ctx.event.id}
        active={ctx.activeTab === "giveaway"}
        mode={ctx.mode}
        onExitEdit={ctx.onSaved}
      />
    ),
  },
  {
    value: "report",
    label: "Report",
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
    render: (ctx) => (
      <DonationsTab
        eventId={ctx.event.id}
        active={ctx.activeTab === "donations"}
        mode={ctx.mode}
      />
    ),
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
    render: (ctx) => (
      <EventExpensesTab
        eventId={ctx.event.id}
        eventName={ctx.event.name}
        active={ctx.activeTab === "expenses"}
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
    render: (ctx) => (
      <EventRevenueTab
        eventId={ctx.event.id}
        eventName={ctx.event.name}
        active={ctx.activeTab === "revenue"}
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
    value: "impact",
    label: "Impact",
    phase: "after",
    kind: "form",
    render: (ctx) => (
      <ImpactTab
        ref={ctx.formCallbacks.impact.registerHandle}
        eventId={ctx.event.id}
        formId={ctx.formId("impact")}
        active={ctx.activeTab === "impact"}
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

const PHASE_LABELS: Record<PhaseKey, string> = {
  basic: "Basic",
  planning: "Planning",
  during: "During",
  after: "After",
};

export const PHASES: {
  key: PhaseKey;
  label: string;
  tabs: { value: TabValue; label: string }[];
}[] = (() => {
  const order: PhaseKey[] = [];
  const tabsByPhase = new Map<PhaseKey, { value: TabValue; label: string }[]>();
  for (const entry of TAB_CONFIG) {
    if (!tabsByPhase.has(entry.phase)) {
      order.push(entry.phase);
      tabsByPhase.set(entry.phase, []);
    }
    tabsByPhase
      .get(entry.phase)!
      .push({ value: entry.value, label: entry.label });
  }
  return order.map((key) => ({
    key,
    label: PHASE_LABELS[key],
    tabs: tabsByPhase.get(key)!,
  }));
})();

export function phaseForTab(tab: TabValue): PhaseKey {
  return TAB_CONFIG.find((entry) => entry.value === tab)!.phase;
}
