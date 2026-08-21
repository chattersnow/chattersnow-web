"use client";

import { useState } from "react";
import { ArrowLeft, Eye } from "lucide-react";
import type { EventRow } from "./event-badges";
import { OverviewTab } from "./overview-tab";
import { AttendanceTab } from "./attendance-tab";
import { SponsorsTab } from "./sponsors-tab";
import { DonationsTab } from "./donations-tab";
import { DistributionsTab } from "./distributions-tab";
import { EventExpensesTab } from "./event-expenses-tab";
import { RaffleTab } from "./raffle-tab";
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
  | "raffle";

export function EventDetailsDialog({ event }: { event: EventRow }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabValue>("overview");
  const [overviewPending, setOverviewPending] = useState(false);
  const overviewFormId = `${OVERVIEW_FORM_ID_PREFIX}-${event.id}`;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setTab("overview");
    }
  }

  return (
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
          <div className="flex flex-col gap-0.5">
            <SheetTitle>{event.name}</SheetTitle>
            <SheetDescription>View and update this event&apos;s details.</SheetDescription>
          </div>
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
              <TabsTrigger value="raffle">Raffle</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <OverviewTab
                event={event}
                formId={overviewFormId}
                onSaved={() => setOpen(false)}
                onPendingChange={setOverviewPending}
              />
            </TabsContent>
            <TabsContent value="sponsors" className="mt-4">
              <SponsorsTab eventId={event.id} active={tab === "sponsors"} />
            </TabsContent>
            <TabsContent value="attendance" className="mt-4">
              <AttendanceTab event={event} />
            </TabsContent>
            <TabsContent value="donations" className="mt-4">
              <DonationsTab eventId={event.id} active={tab === "donations"} />
            </TabsContent>
            <TabsContent value="distributions" className="mt-4">
              <DistributionsTab eventId={event.id} active={tab === "distributions"} />
            </TabsContent>
            <TabsContent value="expenses" className="mt-4">
              <EventExpensesTab eventId={event.id} eventName={event.name} active={tab === "expenses"} />
            </TabsContent>
            <TabsContent value="raffle" className="mt-4">
              <RaffleTab eventId={event.id} active={tab === "raffle"} />
            </TabsContent>
          </Tabs>
        </div>

        {tab === "overview" && (
          <SheetFooter className="flex-row justify-end border-t bg-muted/50">
            <Button type="submit" form={overviewFormId} disabled={overviewPending}>
              {overviewPending ? "Saving..." : "Save changes"}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
