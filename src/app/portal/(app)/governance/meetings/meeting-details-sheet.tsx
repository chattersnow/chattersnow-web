"use client";

import { useState } from "react";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import type { MeetingRow } from "./meeting-badges";
import { OverviewTab } from "./overview-tab";
import { AttendeesTab } from "./attendees-tab";
import { AgendaTab } from "./agenda-tab";
import { MinutesTab } from "./minutes-tab";
import { ActionItemsTab } from "./action-items-tab";
import { DecisionsTab } from "./decisions-tab";
import { ResolutionsTab } from "./resolutions-tab";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TabValue = "overview" | "attendees" | "agenda" | "minutes" | "action-items" | "decisions" | "resolutions";

const TABS: { value: TabValue; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "attendees", label: "Attendees" },
  { value: "agenda", label: "Agenda" },
  { value: "minutes", label: "Minutes" },
  { value: "action-items", label: "Action Items" },
  { value: "decisions", label: "Decisions" },
  { value: "resolutions", label: "Resolutions" },
];

export function MeetingDetailsSheet({ meeting }: { meeting: MeetingRow }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabValue>("overview");
  const [mode, setMode] = useState<"view" | "edit">("view");

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setTab("overview");
      setMode("view");
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" aria-label="View meeting details" />}
      >
        <Eye />
      </SheetTrigger>
      <SheetContent side="right" showCloseButton={false} className="data-[side=right]:sm:max-w-[560px]">
        <SheetHeader className="flex-row items-start gap-2 space-y-0">
          <SheetClose render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Close" />}>
            <ArrowLeft />
          </SheetClose>
          <div className="flex flex-1 flex-col gap-0.5">
            <SheetTitle>Meeting</SheetTitle>
            <SheetDescription>
              {mode === "edit" ? "Update this meeting's details." : "View this meeting's details."}
            </SheetDescription>
          </div>
          {mode === "view" ? (
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit meeting" onClick={() => setMode("edit")}>
              <Pencil />
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode("view")}>
              View
            </Button>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)} className="mt-2">
            <TabsList variant="line" className="flex-wrap">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <OverviewTab meeting={meeting} mode={mode} />
            </TabsContent>
            <TabsContent value="attendees" className="mt-4">
              <AttendeesTab meetingId={meeting.id} active={tab === "attendees"} mode={mode} />
            </TabsContent>
            <TabsContent value="agenda" className="mt-4">
              <AgendaTab meetingId={meeting.id} active={tab === "agenda"} mode={mode} />
            </TabsContent>
            <TabsContent value="minutes" className="mt-4">
              <MinutesTab meetingId={meeting.id} active={tab === "minutes"} mode={mode} />
            </TabsContent>
            <TabsContent value="action-items" className="mt-4">
              <ActionItemsTab meetingId={meeting.id} active={tab === "action-items"} mode={mode} />
            </TabsContent>
            <TabsContent value="decisions" className="mt-4">
              <DecisionsTab
                meetingId={meeting.id}
                meetingDate={meeting.meeting_date.slice(0, 10)}
                active={tab === "decisions"}
                mode={mode}
              />
            </TabsContent>
            <TabsContent value="resolutions" className="mt-4">
              <ResolutionsTab meetingId={meeting.id} active={tab === "resolutions"} mode={mode} />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
