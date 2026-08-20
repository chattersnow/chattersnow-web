"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setTab("overview");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" aria-label="View event details" />}
      >
        <Eye />
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{event.name}</DialogTitle>
          <DialogDescription>View and update this event&apos;s details.</DialogDescription>
        </DialogHeader>

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
            <OverviewTab event={event} onSaved={() => setOpen(false)} />
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
      </DialogContent>
    </Dialog>
  );
}
