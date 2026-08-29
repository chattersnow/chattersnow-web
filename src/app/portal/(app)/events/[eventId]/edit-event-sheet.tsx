"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import type { Program } from "../../programs/actions";
import type { EventRow } from "../event-badges";
import { PhaseStatusBadge } from "../event-badges";
import { phaseStatus } from "../phase-status";
import {
  FORM_ID_PREFIX,
  FORM_TAB_VALUES,
  LOCKED_ON_REPORT_SUBMIT_TABS,
  PHASES,
  TAB_CONFIG,
  phaseForTab,
  type Mode,
  type TabRenderContext,
  type TabValue,
} from "../event-tabs-config";
import { useFormTabState } from "../use-form-tab-state";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const FORM_TAB_VALUE_SET = new Set<TabValue>(FORM_TAB_VALUES);

export function EditEventSheet({
  event,
  programs,
  autoOpenTab,
}: {
  event: EventRow;
  programs: Program[];
  /**
   * Opens the sheet straight to this tab in edit mode on mount, for
   * deep links (e.g. the "awaiting check-in" attention item) that should
   * land directly on the relevant tab instead of the closed sheet.
   */
  autoOpenTab?: TabValue;
}) {
  const [open, setOpen] = useState(!!autoOpenTab);
  const [tab, setTab] = useState<TabValue>(autoOpenTab ?? "overview");
  const [mode, setMode] = useState<Mode>(autoOpenTab ? "edit" : "view");
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(
    null,
  );

  const formTabState = useFormTabState(FORM_TAB_VALUES);
  const { pending, anyDirty } = formTabState;

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
    formTabState.discardAll();
    setMode("view");
    if (discardTarget === "close") {
      setOpen(false);
    }
    setDiscardTarget(null);
  }

  const activePhase = PHASES.find((phase) => phase.key === phaseForTab(tab))!;
  const activeTabLocked =
    LOCKED_ON_REPORT_SUBMIT_TABS.has(tab) &&
    event.report_status === "submitted";

  function selectPhase(key: (typeof PHASES)[number]["key"]) {
    const phase = PHASES.find((p) => p.key === key)!;
    setTab(phase.tabs[0].value);
  }

  const ctx: TabRenderContext = useMemo(
    () => ({
      event,
      programs,
      mode,
      activeTab: tab,
      formId: (tabValue) => `${FORM_ID_PREFIX}-${tabValue}-${event.id}`,
      onSaved: () => setMode("view"),
      formCallbacks: formTabState.callbacks,
    }),
    [event, programs, mode, tab, formTabState.callbacks],
  );

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger render={<Button type="button" variant="secondary" />}>
          <Pencil /> Edit
        </SheetTrigger>
        <SheetContent side="right" showCloseButton={false} size="xl">
          <SheetHeader className="flex-row items-start gap-2 space-y-0">
            <Tooltip>
              <SheetClose
                render={
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Close"
                      />
                    }
                  />
                }
              >
                <ArrowLeft />
              </SheetClose>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
            <div className="flex flex-1 flex-col gap-0.5">
              <SheetTitle>{event.name}</SheetTitle>
              <SheetDescription>
                {mode === "edit"
                  ? "Update this event's details."
                  : "View this event's details."}
              </SheetDescription>
            </div>
            {mode === "view" ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit event"
                      onClick={() => setMode("edit")}
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Edit event</TooltipContent>
              </Tooltip>
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

              {TAB_CONFIG.map((entry) => (
                <TabsContent
                  key={entry.value}
                  value={entry.value}
                  className="mt-4"
                >
                  {entry.render(ctx)}
                </TabsContent>
              ))}
            </Tabs>
          </div>

          {FORM_TAB_VALUE_SET.has(tab) &&
            mode === "edit" &&
            !activeTabLocked && (
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
