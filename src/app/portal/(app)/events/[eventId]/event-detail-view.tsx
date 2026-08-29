"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Program } from "../../programs/actions";
import type { EventLead } from "../actions";
import type { EventRow } from "../event-badges";
import {
  PhaseStatusBadge,
  StatusBadge,
  VisibilityBadge,
} from "../event-badges";
import { phaseStatus } from "../phase-status";
import {
  PHASES,
  TAB_CONFIG,
  type TabRenderContext,
  type TabValue,
} from "../event-tabs-config";
import type { FormTabCallbacks } from "../use-form-tab-state";
import { EditEventSheet } from "./edit-event-sheet";
import { EventDetailsCards } from "./event-details-cards";

const NOOP_CALLBACKS: FormTabCallbacks = {
  onPendingChange: () => {},
  onDirtyChange: () => {},
  registerHandle: () => {},
};

const NOOP_FORM_CALLBACKS = Object.fromEntries(
  TAB_CONFIG.map((entry) => [entry.value, NOOP_CALLBACKS]),
) as Record<TabValue, FormTabCallbacks>;

function viewCtxFor(
  tab: TabValue,
  event: EventRow,
  programs: Program[],
): TabRenderContext {
  return {
    event,
    programs,
    mode: "view",
    activeTab: tab,
    formId: () => `event-detail-${tab}`,
    onSaved: () => {},
    formCallbacks: NOOP_FORM_CALLBACKS,
  };
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h2 className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
      {children}
    </h2>
  );
}

export function EventDetailView({
  event,
  programs,
  eventLeads,
  initialEditTab,
}: {
  event: EventRow;
  programs: Program[];
  eventLeads: EventLead[];
  initialEditTab?: TabValue;
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {event.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={event.status} />
            <VisibilityBadge visibility={event.visibility} />
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <EditEventSheet
            event={event}
            programs={programs}
            autoOpenTab={initialEditTab}
          />
        </div>
      </div>

      <div className="mt-6">
        <EventDetailsCards
          event={event}
          programs={programs}
          eventLeads={eventLeads}
        />
      </div>

      {PHASES.filter((phase) => phase.key !== "basic").map((phase) => {
        const status = phaseStatus(phase.key, event);
        return (
          <div key={phase.key} className="mt-6">
            <div className="flex items-center gap-2">
              <SectionHeading>{phase.label}</SectionHeading>
              {status && <PhaseStatusBadge status={status} />}
            </div>
            <div className="mt-3 flex flex-col gap-4">
              {phase.tabs
                .filter((t) => t.value !== "planning")
                .map((t) => {
                  const entry = TAB_CONFIG.find(
                    (candidate) => candidate.value === t.value,
                  )!;
                  return (
                    <Card key={t.value}>
                      <CardHeader>
                        <CardTitle className="app-muted text-sm font-semibold">
                          {t.label}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {entry.render(viewCtxFor(t.value, event, programs))}
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </div>
        );
      })}
    </>
  );
}
