"use client";

import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import type { Program } from "../../programs/actions";
import type { EventRow } from "../event-badges";
import {
  PhaseStatusBadge,
  StatusBadge,
  VisibilityBadge,
} from "../event-badges";
import { phaseStatus, type PhaseKey } from "../phase-status";
import {
  FORM_ID_PREFIX,
  LOCKED_ON_REPORT_SUBMIT_TABS,
  PHASES,
  TAB_CONFIG,
  phaseForTab,
  type TabConfigEntry,
  type TabRenderContext,
  type TabValue,
} from "../event-tabs-config";
import { useFormTabState, type FormTabCallbacks } from "../use-form-tab-state";
import { TabRefreshProvider, useTabRefresh } from "@/hooks/use-tab-refresh";

const NOOP_CALLBACKS: FormTabCallbacks = {
  onPendingChange: () => {},
  onDirtyChange: () => {},
  registerHandle: () => {},
};

const NOOP_FORM_CALLBACKS = Object.fromEntries(
  TAB_CONFIG.map((entry) => [entry.value, NOOP_CALLBACKS]),
) as Record<TabValue, FormTabCallbacks>;

// Tabs whose edit UI renders its own save/cancel controls, so the card only
// toggles the mode and doesn't add a footer.
const SELF_MANAGED_EDIT_TABS: ReadonlySet<TabValue> = new Set([
  "attendance",
  "giveaway",
]);

// Form-style cards small enough to share a row on large screens; everything
// else holds tables that need the full width.
const HALF_WIDTH_TABS: ReadonlySet<TabValue> = new Set([
  "overview",
  "checklist",
  "planning",
  "logistics",
  "attendance",
]);

const CARD_TITLES: Partial<Record<TabValue, string>> = {
  overview: "Event details",
  planning: "Registration & planning",
};

function entryFor(tab: TabValue): TabConfigEntry {
  return TAB_CONFIG.find((entry) => entry.value === tab)!;
}

/**
 * Card wrapper for a tab that toggles between view and inline edit via a
 * pencil action, replacing the old full-event edit sheet.
 */
function EditableTabCard({
  entry,
  title,
  event,
  programs,
  canManage,
}: {
  entry: TabConfigEntry;
  title: string;
  event: EventRow;
  programs: Program[];
  canManage: boolean;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const formTabs = useMemo(() => [entry.value], [entry.value]);
  const formTabState = useFormTabState(formTabs);
  const pending = formTabState.pending[entry.value] ?? false;

  const formId = `${FORM_ID_PREFIX}-${entry.value}-${event.id}`;
  const ctx: TabRenderContext = {
    event,
    programs,
    mode,
    activeTab: entry.value,
    formId: (tabValue) => `${FORM_ID_PREFIX}-${tabValue}-${event.id}`,
    onSaved: () => setMode("view"),
    formCallbacks: { ...NOOP_FORM_CALLBACKS, ...formTabState.callbacks },
  };

  const locked =
    LOCKED_ON_REPORT_SUBMIT_TABS.has(entry.value) &&
    event.report_status === "submitted";
  const canEdit = canManage && !locked;
  const selfManaged = SELF_MANAGED_EDIT_TABS.has(entry.value);

  function cancel() {
    formTabState.discardAll();
    setMode("view");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          {title}
        </CardTitle>
        {canEdit && mode === "view" && (
          <CardAction>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${title.toLowerCase()}`}
              onClick={() => setMode("edit")}
            >
              <Pencil />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>{entry.render(ctx)}</CardContent>
      {!selfManaged && mode === "edit" && (
        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

/**
 * Card wrapper for list-style tabs whose add/manage controls are shown
 * based on the user's events permission rather than an edit toggle.
 */
function PlainTabCard({
  entry,
  title,
  event,
  programs,
  canManage,
}: {
  entry: TabConfigEntry;
  title: string;
  event: EventRow;
  programs: Program[];
  canManage: boolean;
}) {
  const ctx: TabRenderContext = {
    event,
    programs,
    mode: canManage ? "edit" : "view",
    activeTab: entry.value,
    formId: (tabValue) => `${FORM_ID_PREFIX}-${tabValue}-${event.id}`,
    onSaved: () => {},
    formCallbacks: NOOP_FORM_CALLBACKS,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{entry.render(ctx)}</CardContent>
    </Card>
  );
}

export function EventDetailView(props: {
  event: EventRow;
  programs: Program[];
  canManage: boolean;
  initialTab?: TabValue;
}) {
  return (
    <TabRefreshProvider>
      <EventDetailContent {...props} />
    </TabRefreshProvider>
  );
}

function EventDetailContent({
  event,
  programs,
  canManage,
  initialTab,
}: {
  event: EventRow;
  programs: Program[];
  canManage: boolean;
  initialTab?: TabValue;
}) {
  const [phaseKey, setPhaseKey] = useState<PhaseKey>(
    initialTab ? phaseForTab(initialTab) : "basic",
  );
  const { notify } = useTabRefresh<TabValue>();
  const currentPhase = PHASES.find((phase) => phase.key === phaseKey)!;

  return (
    <>
      <div>
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {event.name}
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={event.status} />
          <VisibilityBadge visibility={event.visibility} />
        </div>
      </div>

      <Tabs
        value={phaseKey}
        onValueChange={(value) => setPhaseKey(value as PhaseKey)}
        className="mt-6"
      >
        <div className="rainbow-surface flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <TabsList variant="line" className="flex-wrap">
            {PHASES.map((phase) => {
              const status = phaseStatus(phase.key, event);
              return (
                <TabsTrigger key={phase.key} value={phase.key}>
                  {phase.key === "basic" ? "Overview" : phase.label}
                  {status && <PhaseStatusBadge status={status} />}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              {currentPhase.tabs.map((t) => {
                const entry = entryFor(t.value);
                if (!entry.toolbarActions) return null;
                return (
                  <div
                    key={t.value}
                    className="flex flex-wrap items-center gap-2"
                  >
                    {entry.toolbarActions({
                      eventId: event.id,
                      eventName: event.name,
                      onSaved: () => notify(t.value),
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {PHASES.map((phase) => (
          <TabsContent key={phase.key} value={phase.key} className="mt-4">
            <div className="grid items-start gap-6 lg:grid-cols-2">
              {phase.tabs.map((t) => {
                const entry = entryFor(t.value);
                const editToggle =
                  entry.kind === "form" || SELF_MANAGED_EDIT_TABS.has(t.value);
                const TabCard = editToggle ? EditableTabCard : PlainTabCard;
                return (
                  <div
                    key={t.value}
                    className={
                      HALF_WIDTH_TABS.has(t.value) ? undefined : "lg:col-span-2"
                    }
                  >
                    <TabCard
                      entry={entry}
                      title={CARD_TITLES[t.value] ?? t.label}
                      event={event}
                      programs={programs}
                      canManage={canManage}
                    />
                  </div>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
