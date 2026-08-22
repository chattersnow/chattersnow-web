"use client";

import { useRef, useState } from "react";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import type { EventRow } from "./event-badges";
import { OverviewTab, type OverviewTabHandle } from "./overview-tab";
import { AttendanceTab } from "./attendance-tab";
import { SponsorsTab } from "./sponsors-tab";
import { DonationsTab } from "./donations-tab";
import { DistributionsTab } from "./distributions-tab";
import { EventExpensesTab } from "./event-expenses-tab";
import { GiveawayTab } from "./giveaway-tab";
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

const OVERVIEW_FORM_ID_PREFIX = "event-overview-form";

type TabValue =
  | "overview"
  | "sponsors"
  | "attendance"
  | "donations"
  | "distributions"
  | "expenses"
  | "giveaway";

type Mode = "view" | "edit";

export function EventDetailsDialog({ event }: { event: EventRow }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabValue>("overview");
  const [mode, setMode] = useState<Mode>("view");
  const [overviewPending, setOverviewPending] = useState(false);
  const [overviewDirty, setOverviewDirty] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<"toggle" | "close" | null>(null);
  const overviewTabRef = useRef<OverviewTabHandle>(null);
  const overviewFormId = `${OVERVIEW_FORM_ID_PREFIX}-${event.id}`;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && mode === "edit" && overviewDirty) {
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
    if (overviewDirty) {
      setDiscardTarget("toggle");
      return;
    }
    setMode("view");
  }

  function confirmDiscard() {
    overviewTabRef.current?.discard();
    setMode("view");
    if (discardTarget === "close") {
      setOpen(false);
    }
    setDiscardTarget(null);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger
          render={<Button type="button" variant="ghost" size="icon-sm" aria-label="View event details" />}
        >
          <Eye />
        </SheetTrigger>
        <SheetContent side="right" showCloseButton={false} className="data-[side=right]:sm:max-w-[640px]">
          <SheetHeader className="flex-row items-start gap-2 space-y-0">
            <SheetClose
              render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Close" />}
            >
              <ArrowLeft />
            </SheetClose>
            <div className="flex flex-1 flex-col gap-0.5">
              <SheetTitle>{event.name}</SheetTitle>
              <SheetDescription>
                {mode === "edit" ? "Update this event's details." : "View this event's details."}
              </SheetDescription>
            </div>
            {mode === "view" ? (
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit event" onClick={() => setMode("edit")}>
                <Pencil />
              </Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={requestExitEditMode}>
                View
              </Button>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)} className="mt-2">
              <TabsList variant="line" className="flex-wrap">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="sponsors">Sponsors</TabsTrigger>
                <TabsTrigger value="attendance">Attendance</TabsTrigger>
                <TabsTrigger value="donations">Donations</TabsTrigger>
                <TabsTrigger value="distributions">Distributions</TabsTrigger>
                <TabsTrigger value="expenses">Expenses</TabsTrigger>
                <TabsTrigger value="giveaway">Giveaway</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                <OverviewTab
                  ref={overviewTabRef}
                  event={event}
                  formId={overviewFormId}
                  mode={mode}
                  onSaved={() => setMode("view")}
                  onPendingChange={setOverviewPending}
                  onDirtyChange={setOverviewDirty}
                />
              </TabsContent>
              <TabsContent value="sponsors" className="mt-4">
                <SponsorsTab eventId={event.id} active={tab === "sponsors"} mode={mode} />
              </TabsContent>
              <TabsContent value="attendance" className="mt-4">
                <AttendanceTab event={event} mode={mode} />
              </TabsContent>
              <TabsContent value="donations" className="mt-4">
                <DonationsTab eventId={event.id} active={tab === "donations"} mode={mode} />
              </TabsContent>
              <TabsContent value="distributions" className="mt-4">
                <DistributionsTab eventId={event.id} active={tab === "distributions"} mode={mode} />
              </TabsContent>
              <TabsContent value="expenses" className="mt-4">
                <EventExpensesTab eventId={event.id} eventName={event.name} active={tab === "expenses"} mode={mode} />
              </TabsContent>
              <TabsContent value="giveaway" className="mt-4">
                <GiveawayTab eventId={event.id} active={tab === "giveaway"} mode={mode} />
              </TabsContent>
            </Tabs>
          </div>

          {tab === "overview" && mode === "edit" && (
            <SheetFooter className="flex-row justify-end border-t bg-muted/50">
              <Button type="submit" form={overviewFormId} disabled={overviewPending}>
                {overviewPending ? "Saving..." : "Save changes"}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={discardTarget !== null} onOpenChange={(next) => !next && setDiscardTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this event. Leaving now will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDiscardTarget(null)}>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>Discard changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
