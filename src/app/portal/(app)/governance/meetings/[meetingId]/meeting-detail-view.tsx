"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import type { MeetingRow } from "../meeting-badges";
import { MeetingStatusBadge, MeetingTypeBadge } from "../meeting-badges";
import { AttendeesTab } from "../attendees-tab";
import { AgendaTab } from "../agenda-tab";
import { ActionItemsTab } from "../action-items-tab";
import { DecisionsTab } from "../decisions-tab";
import { ResolutionsTab } from "../resolutions-tab";
import { MeetingDetailsCards } from "./meeting-details-cards";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

type TabValue = "overview" | "agenda";

function SectionCard({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div id={id}>
      <Card>
        <CardHeader>
          <CardTitle className="app-muted text-sm font-semibold">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

/**
 * Agenda gets its own card-level pencil toggle: AgendaTab's edit mode is a
 * self-managed form with its own save/cancel, so the card only flips the mode.
 */
function AgendaCard({
  meeting,
  canManage,
  onViewActionItems,
  onViewDecisions,
}: {
  meeting: MeetingRow;
  canManage: boolean;
  onViewActionItems: () => void;
  onViewDecisions: () => void;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          Agenda
        </CardTitle>
        {canManage && mode === "view" && (
          <CardAction>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Edit agenda"
              onClick={() => setMode("edit")}
            >
              <Pencil />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <AgendaTab
          meetingId={meeting.id}
          meetingDate={meeting.meeting_date}
          active
          mode={mode}
          onViewActionItems={onViewActionItems}
          onViewDecisions={onViewDecisions}
          onExitEdit={() => setMode("view")}
        />
      </CardContent>
    </Card>
  );
}

export function MeetingDetailView({
  meeting,
  canManage,
}: {
  meeting: MeetingRow;
  canManage: boolean;
}) {
  const [tab, setTab] = useState<TabValue>("overview");
  const pendingScrollRef = useRef<string | null>(null);

  // Cross-tab links (agenda -> action items/decisions) scroll after the
  // overview panel has re-mounted.
  useEffect(() => {
    if (tab !== "overview" || !pendingScrollRef.current) return;
    document
      .getElementById(pendingScrollRef.current)
      ?.scrollIntoView({ behavior: "smooth" });
    pendingScrollRef.current = null;
  }, [tab]);

  function goToOverviewSection(id: string) {
    pendingScrollRef.current = id;
    setTab("overview");
  }

  const listMode = canManage ? "edit" : "view";

  return (
    <>
      <div>
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {dateFormatter.format(new Date(meeting.meeting_date))}
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <MeetingTypeBadge type={meeting.meeting_type} />
          <MeetingStatusBadge status={meeting.status} />
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as TabValue)}
        className="mt-6"
      >
        <TabsList variant="line" className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="flex flex-col gap-6">
            <MeetingDetailsCards meeting={meeting} canManage={canManage} />

            <SectionCard title="Attendees">
              <AttendeesTab meetingId={meeting.id} active mode={listMode} />
            </SectionCard>

            <SectionCard id="action-items-section" title="Action Items">
              <ActionItemsTab meetingId={meeting.id} active mode={listMode} />
            </SectionCard>

            <SectionCard id="decisions-section" title="Decisions">
              <DecisionsTab
                meetingId={meeting.id}
                meetingDate={meeting.meeting_date.slice(0, 10)}
                active
                mode={listMode}
              />
            </SectionCard>

            <SectionCard title="Resolutions">
              <ResolutionsTab meetingId={meeting.id} active mode={listMode} />
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="agenda" className="mt-4">
          <AgendaCard
            meeting={meeting}
            canManage={canManage}
            onViewActionItems={() =>
              goToOverviewSection("action-items-section")
            }
            onViewDecisions={() => goToOverviewSection("decisions-section")}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
