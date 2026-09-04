"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { useUrlTabState } from "@/components/portal/use-url-tab-state";
import { Pencil } from "lucide-react";
import type { MeetingRow } from "../meeting-badges";
import { MeetingStatusBadge, MeetingTypeBadge } from "../meeting-badges";
import { AttendeesTab } from "../attendees-tab";
import { AgendaTab } from "../agenda-tab";
import { ActionItemsTab } from "../action-items-tab";
import { DecisionsTab } from "../decisions-tab";
import { ResolutionsTab } from "../resolutions-tab";
import { MeetingDetailsCards } from "./meeting-details-cards";
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
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/format";

type TabValue = "overview" | "agenda";

function isTabValue(value: string): value is TabValue {
  return value === "overview" || value === "agenda";
}

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
  mode,
  onModeChange,
  onDirtyChange,
  onViewActionItems,
  onViewDecisions,
}: {
  meeting: MeetingRow;
  canManage: boolean;
  mode: "view" | "edit";
  onModeChange: (mode: "view" | "edit") => void;
  onDirtyChange: (dirty: boolean) => void;
  onViewActionItems: () => void;
  onViewDecisions: () => void;
}) {
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
              onClick={() => onModeChange("edit")}
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
          mode={mode}
          canManage={canManage}
          minutesApprovedAt={meeting.minutes_approved_at}
          onViewActionItems={onViewActionItems}
          onViewDecisions={onViewDecisions}
          onExitEdit={() => onModeChange("view")}
          onDirtyChange={onDirtyChange}
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
  // In the URL rather than in state, so Back returns to the previous tab
  // instead of leaving the meeting, and a link can point at the agenda.
  const [tab, setTab] = useUrlTabState<TabValue>({
    fallback: "overview",
    isValid: isTabValue,
  });
  const [agendaMode, setAgendaMode] = useState<"view" | "edit">("view");
  const [agendaDirty, setAgendaDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<TabValue | null>(null);
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

  // Base UI's Tabs unmounts an inactive TabsContent's subtree by default, so
  // switching away from Agenda while its form is mid-edit would otherwise
  // silently discard whatever the user typed. Gate the switch on a confirm
  // dialog when that's the case, mirroring the "Discard changes?" pattern
  // used for the bylaws editor (edit-bylaws-modal.tsx).
  function handleTabChange(value: string) {
    const next = value as TabValue;
    if (tab === "agenda" && agendaMode === "edit" && agendaDirty) {
      setPendingTab(next);
      return;
    }
    setTab(next);
  }

  function confirmDiscardAgenda() {
    setAgendaMode("view");
    setAgendaDirty(false);
    if (pendingTab) {
      setTab(pendingTab);
      setPendingTab(null);
    }
  }

  const listMode = canManage ? "edit" : "view";

  return (
    <>
      <div>
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {formatDateTime(meeting.meeting_date)}
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <MeetingTypeBadge type={meeting.meeting_type} />
          <MeetingStatusBadge status={meeting.status} />
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="mt-6">
        <div className="rainbow-surface flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <TabsList variant="line" className="flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4">
          <div className="flex flex-col gap-6">
            <MeetingDetailsCards meeting={meeting} canManage={canManage} />

            <SectionCard title="Attendees">
              <AttendeesTab meetingId={meeting.id} mode={listMode} />
            </SectionCard>

            <SectionCard id="action-items-section" title="Action Items">
              <ActionItemsTab meetingId={meeting.id} mode={listMode} />
            </SectionCard>

            <SectionCard id="decisions-section" title="Decisions">
              <DecisionsTab
                meetingId={meeting.id}
                meetingDate={meeting.meeting_date.slice(0, 10)}
                mode={listMode}
              />
            </SectionCard>

            <SectionCard title="Resolutions">
              <ResolutionsTab meetingId={meeting.id} mode={listMode} />
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="agenda" className="mt-4">
          <AgendaCard
            meeting={meeting}
            canManage={canManage}
            mode={agendaMode}
            onModeChange={setAgendaMode}
            onDirtyChange={setAgendaDirty}
            onViewActionItems={() =>
              goToOverviewSection("action-items-section")
            }
            onViewDecisions={() => goToOverviewSection("decisions-section")}
          />
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={pendingTab !== null}
        onOpenChange={(next) => !next && setPendingTab(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this agenda. Leaving now will discard
              them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingTab(null)}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscardAgenda}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
