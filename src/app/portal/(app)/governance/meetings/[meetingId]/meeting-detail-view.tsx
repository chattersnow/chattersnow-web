"use client";

import type { MeetingRow } from "../meeting-badges";
import { MeetingStatusBadge, MeetingTypeBadge } from "../meeting-badges";
import { AttendeesTab } from "../attendees-tab";
import { AgendaTab } from "../agenda-tab";
import { ActionItemsTab } from "../action-items-tab";
import { DecisionsTab } from "../decisions-tab";
import { ResolutionsTab } from "../resolutions-tab";
import { EditMeetingSheet } from "./edit-meeting-sheet";
import { MeetingDetailsCards } from "./meeting-details-cards";
import { Card, CardContent } from "@/components/ui/card";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function noop() {}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h2 className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
      {children}
    </h2>
  );
}

export function MeetingDetailView({ meeting }: { meeting: MeetingRow }) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {dateFormatter.format(new Date(meeting.meeting_date))}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <MeetingTypeBadge type={meeting.meeting_type} />
            <MeetingStatusBadge status={meeting.status} />
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <EditMeetingSheet meeting={meeting} />
        </div>
      </div>

      <div className="mt-6">
        <MeetingDetailsCards meeting={meeting} />
      </div>

      <div id="attendees-section" className="mt-6">
        <SectionHeading>Attendees</SectionHeading>
        <div className="mt-3">
          <Card>
            <CardContent>
              <AttendeesTab meetingId={meeting.id} active mode="view" />
            </CardContent>
          </Card>
        </div>
      </div>

      <div id="agenda-section" className="mt-6">
        <SectionHeading>Agenda</SectionHeading>
        <div className="mt-3">
          <Card>
            <CardContent>
              <AgendaTab
                meetingId={meeting.id}
                meetingDate={meeting.meeting_date}
                active
                mode="view"
                onViewActionItems={() =>
                  scrollToSection("action-items-section")
                }
                onViewDecisions={() => scrollToSection("decisions-section")}
                onExitEdit={noop}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <div id="action-items-section" className="mt-6">
        <SectionHeading>Action Items</SectionHeading>
        <div className="mt-3">
          <Card>
            <CardContent>
              <ActionItemsTab meetingId={meeting.id} active mode="view" />
            </CardContent>
          </Card>
        </div>
      </div>

      <div id="decisions-section" className="mt-6">
        <SectionHeading>Decisions</SectionHeading>
        <div className="mt-3">
          <Card>
            <CardContent>
              <DecisionsTab
                meetingId={meeting.id}
                meetingDate={meeting.meeting_date.slice(0, 10)}
                active
                mode="view"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <SectionHeading>Resolutions</SectionHeading>
        <div className="mt-3">
          <Card>
            <CardContent>
              <ResolutionsTab meetingId={meeting.id} active mode="view" />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
