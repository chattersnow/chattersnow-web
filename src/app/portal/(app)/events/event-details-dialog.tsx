"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import type { Program } from "../programs/actions";
import type { EventRow, PhaseStatus } from "./event-badges";
import { PhaseStatusBadge } from "./event-badges";
import { OverviewTab, type OverviewTabHandle } from "./overview-tab";
import { PlanningTab, type PlanningTabHandle } from "./planning-tab";
import { LogisticsTab, type LogisticsTabHandle } from "./logistics-tab";
import { VolunteersTab } from "./volunteers-tab";
import { SponsorsTab } from "./sponsors-tab";
import { AttendanceTab } from "./attendance-tab";
import { RegistrantsTab } from "./registrants-tab";
import { DiscountCodesTab } from "./discount-codes-tab";
import { DonationsTab } from "./donations-tab";
import { DistributionsTab } from "./distributions-tab";
import { IncidentsTab } from "./incidents-tab";
import { EventExpensesTab } from "./event-expenses-tab";
import { GiveawayTab } from "./giveaway-tab";
import { ReportTab, type ReportTabHandle } from "./report-tab";
import { ImpactTab, type ImpactTabHandle } from "./impact-tab";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const FORM_ID_PREFIX = "event-details-form";

type TabValue =
  | "overview"
  | "planning"
  | "logistics"
  | "volunteers"
  | "sponsors"
  | "attendance"
  | "registrants"
  | "discount-codes"
  | "distributions"
  | "incidents"
  | "giveaway"
  | "expenses"
  | "report"
  | "impact"
  | "donations";

// Tabs whose form submits through the sheet's shared footer Save button
// (formId + dirty/discard tracking); everything else manages its own
// inline add/edit/delete affordances, same as the pre-workflow tabs did.
const FORM_TABS = new Set<TabValue>([
  "overview",
  "planning",
  "logistics",
  "report",
  "impact",
]);

type Mode = "view" | "edit";

type PhaseKey = "basic" | "planning" | "during" | "after";

const PHASES: {
  key: PhaseKey;
  label: string;
  tabs: { value: TabValue; label: string }[];
}[] = [
  {
    key: "basic",
    label: "Basic",
    tabs: [{ value: "overview", label: "Overview" }],
  },
  {
    key: "planning",
    label: "Planning",
    tabs: [
      { value: "planning", label: "Planning" },
      { value: "logistics", label: "Logistics" },
      { value: "volunteers", label: "Volunteers" },
      { value: "sponsors", label: "Sponsors" },
    ],
  },
  {
    key: "during",
    label: "During",
    tabs: [
      { value: "attendance", label: "Attendance" },
      { value: "registrants", label: "Registrants" },
      { value: "discount-codes", label: "Discount codes" },
      { value: "distributions", label: "Distributions" },
      { value: "incidents", label: "Incidents" },
      { value: "giveaway", label: "Giveaway" },
    ],
  },
  {
    key: "after",
    label: "After",
    tabs: [
      { value: "expenses", label: "Expenses" },
      { value: "report", label: "Report" },
      { value: "impact", label: "Impact" },
      { value: "donations", label: "Donations" },
    ],
  },
];

function phaseForTab(tab: TabValue): PhaseKey {
  return PHASES.find((phase) => phase.tabs.some((t) => t.value === tab))!.key;
}

function planningStatus(event: EventRow): PhaseStatus {
  const signals = [event.event_lead_id, event.capacity, event.budget_amount];
  const present = signals.filter(
    (value) => value !== null && value !== undefined,
  ).length;
  if (present === 0) return "not_started";
  if (present === signals.length) return "done";
  return "in_progress";
}

function duringStatus(event: EventRow): PhaseStatus {
  if (event.attendance_count !== null) return "done";
  return new Date(event.starts_at) <= new Date()
    ? "in_progress"
    : "not_started";
}

function afterStatus(event: EventRow): PhaseStatus {
  return event.report_status === "submitted"
    ? "done"
    : event.report_status === "in_progress"
      ? "in_progress"
      : "not_started";
}

function phaseStatus(key: PhaseKey, event: EventRow): PhaseStatus | null {
  if (key === "planning") return planningStatus(event);
  if (key === "during") return duringStatus(event);
  if (key === "after") return afterStatus(event);
  return null;
}

export function EventDetailsDialog({
  event,
  programs,
}: {
  event: EventRow;
  programs: Program[];
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabValue>("overview");
  const [mode, setMode] = useState<Mode>("view");
  const [pending, setPending] = useState<Partial<Record<TabValue, boolean>>>(
    {},
  );
  const [dirty, setDirty] = useState<Partial<Record<TabValue, boolean>>>({});
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );
  const overviewTabRef = useRef<OverviewTabHandle>(null);
  const planningTabRef = useRef<PlanningTabHandle>(null);
  const logisticsTabRef = useRef<LogisticsTabHandle>(null);
  const reportTabRef = useRef<ReportTabHandle>(null);
  const impactTabRef = useRef<ImpactTabHandle>(null);

  const anyDirty = Object.values(dirty).some(Boolean);

  // Stable per-tab callbacks — the child tabs use these as effect
  // dependencies, so a new function identity every render (as an inline
  // arrow prop would be) re-fires those effects every render and loops.
  const onOverviewPending = useCallback(
    (value: boolean) => setPending((prev) => ({ ...prev, overview: value })),
    [],
  );
  const onOverviewDirty = useCallback(
    (value: boolean) => setDirty((prev) => ({ ...prev, overview: value })),
    [],
  );
  const onPlanningPending = useCallback(
    (value: boolean) => setPending((prev) => ({ ...prev, planning: value })),
    [],
  );
  const onPlanningDirty = useCallback(
    (value: boolean) => setDirty((prev) => ({ ...prev, planning: value })),
    [],
  );
  const onLogisticsPending = useCallback(
    (value: boolean) => setPending((prev) => ({ ...prev, logistics: value })),
    [],
  );
  const onLogisticsDirty = useCallback(
    (value: boolean) => setDirty((prev) => ({ ...prev, logistics: value })),
    [],
  );
  const onReportPending = useCallback(
    (value: boolean) => setPending((prev) => ({ ...prev, report: value })),
    [],
  );
  const onReportDirty = useCallback(
    (value: boolean) => setDirty((prev) => ({ ...prev, report: value })),
    [],
  );
  const onImpactPending = useCallback(
    (value: boolean) => setPending((prev) => ({ ...prev, impact: value })),
    [],
  );
  const onImpactDirty = useCallback(
    (value: boolean) => setDirty((prev) => ({ ...prev, impact: value })),
    [],
  );

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mode === "edit" && anyDirty) {
      setDiscardTarget("close");
      return;
    }
    setOpen(nextOpen);
    if (nextOpen) {
      setTab("overview");
      setMode("view");
    }
  }

  function requestExitEditMode() {
    if (anyDirty) {
      setDiscardTarget("toggle");
      return;
    }
    setMode("view");
  }

  function confirmDiscard() {
    overviewTabRef.current?.discard();
    planningTabRef.current?.discard();
    logisticsTabRef.current?.discard();
    reportTabRef.current?.discard();
    impactTabRef.current?.discard();
    setMode("view");
    if (discardTarget === "close") {
      setOpen(false);
    }
    setDiscardTarget(null);
  }

  const activePhase = PHASES.find((phase) => phase.key === phaseForTab(tab))!;

  function selectPhase(key: PhaseKey) {
    const phase = PHASES.find((p) => p.key === key)!;
    setTab(phase.tabs[0].value);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="View event details"
            />
          }
        >
          <Eye />
        </SheetTrigger>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="data-[side=right]:sm:max-w-[640px]"
        >
          <SheetHeader className="flex-row items-start gap-2 space-y-0">
            <SheetClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                />
              }
            >
              <ArrowLeft />
            </SheetClose>
            <div className="flex flex-1 flex-col gap-0.5">
              <SheetTitle>{event.name}</SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update this event's details."
                  : "View this event's details."}
              </SheetDescription>
            </div>
            {mode === "view" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Edit event"
                onClick={() => setMode("edit")}
              >
                <Pencil />
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={requestExitEditMode}
              >
                View
              </Button>
            )}
          </SheetHeader>

          <div className="flex flex-wrap gap-2 border-b border-[var(--line)] px-4 pb-3">
            {PHASES.map((phase) => {
              const isActive = phase.key === activePhase.key;
              const status = phaseStatus(phase.key, event);
              return (
                <button
                  key={phase.key}
                  type="button"
                  onClick={() => selectPhase(phase.key)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "border-[var(--purple-deep)] bg-[var(--purple-soft)] text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-[var(--purple-soft)]/50",
                  )}
                >
                  {phase.label}
                  {status && <PhaseStatusBadge status={status} />}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as TabValue)}
              className="mt-2"
            >
              <TabsList variant="line" className="flex-wrap">
                {activePhase.tabs.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                <OverviewTab
                  ref={overviewTabRef}
                  event={event}
                  programs={programs}
                  formId={`${FORM_ID_PREFIX}-overview-${event.id}`}
                  mode={mode}
                  onSaved={() => setMode("view")}
                  onPendingChange={onOverviewPending}
                  onDirtyChange={onOverviewDirty}
                />
              </TabsContent>
              <TabsContent value="planning" className="mt-4">
                <PlanningTab
                  ref={planningTabRef}
                  event={event}
                  formId={`${FORM_ID_PREFIX}-planning-${event.id}`}
                  mode={mode}
                  onSaved={() => setMode("view")}
                  onPendingChange={onPlanningPending}
                  onDirtyChange={onPlanningDirty}
                />
              </TabsContent>
              <TabsContent value="logistics" className="mt-4">
                <LogisticsTab
                  ref={logisticsTabRef}
                  eventId={event.id}
                  formId={`${FORM_ID_PREFIX}-logistics-${event.id}`}
                  active={tab === "logistics"}
                  mode={mode}
                  onSaved={() => setMode("view")}
                  onPendingChange={onLogisticsPending}
                  onDirtyChange={onLogisticsDirty}
                />
              </TabsContent>
              <TabsContent value="volunteers" className="mt-4">
                <VolunteersTab
                  eventId={event.id}
                  active={tab === "volunteers"}
                  mode={mode}
                />
              </TabsContent>
              <TabsContent value="sponsors" className="mt-4">
                <SponsorsTab
                  eventId={event.id}
                  active={tab === "sponsors"}
                  mode={mode}
                />
              </TabsContent>
              <TabsContent value="attendance" className="mt-4">
                <AttendanceTab
                  event={event}
                  mode={mode}
                  active={tab === "attendance"}
                />
              </TabsContent>
              <TabsContent value="registrants" className="mt-4">
                <RegistrantsTab
                  eventId={event.id}
                  capacity={event.capacity}
                  active={tab === "registrants"}
                  mode={mode}
                />
              </TabsContent>
              <TabsContent value="discount-codes" className="mt-4">
                <DiscountCodesTab
                  eventId={event.id}
                  active={tab === "discount-codes"}
                  mode={mode}
                />
              </TabsContent>
              <TabsContent value="distributions" className="mt-4">
                <DistributionsTab
                  eventId={event.id}
                  active={tab === "distributions"}
                  mode={mode}
                />
              </TabsContent>
              <TabsContent value="incidents" className="mt-4">
                <IncidentsTab
                  eventId={event.id}
                  active={tab === "incidents"}
                  mode={mode}
                />
              </TabsContent>
              <TabsContent value="giveaway" className="mt-4">
                <GiveawayTab
                  eventId={event.id}
                  active={tab === "giveaway"}
                  mode={mode}
                />
              </TabsContent>
              <TabsContent value="expenses" className="mt-4">
                <EventExpensesTab
                  eventId={event.id}
                  eventName={event.name}
                  active={tab === "expenses"}
                  mode={mode}
                />
              </TabsContent>
              <TabsContent value="report" className="mt-4">
                <ReportTab
                  ref={reportTabRef}
                  event={event}
                  formId={`${FORM_ID_PREFIX}-report-${event.id}`}
                  mode={mode}
                  onSaved={() => setMode("view")}
                  onPendingChange={onReportPending}
                  onDirtyChange={onReportDirty}
                />
              </TabsContent>
              <TabsContent value="impact" className="mt-4">
                <ImpactTab
                  ref={impactTabRef}
                  eventId={event.id}
                  formId={`${FORM_ID_PREFIX}-impact-${event.id}`}
                  active={tab === "impact"}
                  mode={mode}
                  onSaved={() => setMode("view")}
                  onPendingChange={onImpactPending}
                  onDirtyChange={onImpactDirty}
                />
              </TabsContent>
              <TabsContent value="donations" className="mt-4">
                <DonationsTab
                  eventId={event.id}
                  active={tab === "donations"}
                  mode={mode}
                />
              </TabsContent>
            </Tabs>
          </div>

          {FORM_TABS.has(tab) && mode === "edit" && (
            <SheetFooter className="flex-row justify-end border-t bg-muted/50">
              <Button
                type="submit"
                form={`${FORM_ID_PREFIX}-${tab}-${event.id}`}
                disabled={pending[tab]}
              >
                {pending[tab] ? "Saving..." : "Save changes"}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={discardTarget !== null}
        onOpenChange={(next) => !next && setDiscardTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this event. Leaving now will discard
              them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDiscardTarget(null)}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
