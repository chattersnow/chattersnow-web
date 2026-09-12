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
  PhaseOutstandingBadge,
  StatusBadge,
  VisibilityBadge,
} from "../event-badges";
import { isPhaseKey, type PhaseKey } from "../phase-status";
import {
  FORM_ID_PREFIX,
  LOCKED_ON_REPORT_SUBMIT_TABS,
  TAB_CONFIG,
  phaseForTab,
  type EventPhase,
  type TabConfigEntry,
  type TabRenderContext,
  type TabValue,
} from "../event-tabs-config";
import { useFormTabState, type FormTabCallbacks } from "../use-form-tab-state";
import { TabRefreshProvider, useTabRefresh } from "@/hooks/use-tab-refresh";
import { EventPhaseDataProvider, useEventPhaseData } from "../event-phase-data";
import { useUrlTabState } from "@/components/portal/use-url-tab-state";
import { DeleteEventButton } from "./delete-event-button";

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

  const shared = useEventPhaseData();

  const formId = `${FORM_ID_PREFIX}-${entry.value}-${event.id}`;
  const ctx: TabRenderContext = {
    event,
    programs,
    mode,
    shared,
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
 * A plain tab's create actions, in its own card header.
 *
 * These used to be merged into one strip beside the phase tabs, which put
 * every card's actions in a single row -- seven of them on "During" -- with
 * nothing tying a button to the card it belonged to, and left the operator
 * scrolling back to the top of a long phase to reach any of them.
 *
 * Returns `CardAction` as its root so the div stays a direct grid child of
 * `CardHeader`, which is what positions it. `EditableTabCard` spends its one
 * `CardAction` on the edit pencil, so no `kind: "form"` tab may define
 * `toolbarActions`.
 */
function TabCardActions({
  entry,
  event,
  canManage,
}: {
  entry: TabConfigEntry;
  event: EventRow;
  canManage: boolean;
}) {
  const { notify } = useTabRefresh<TabValue>();
  if (!canManage || !entry.toolbarActions) return null;

  return (
    <CardAction className="flex flex-wrap items-center justify-end gap-2">
      {entry.toolbarActions({
        eventId: event.id,
        eventName: event.name,
        onSaved: () => notify(entry.value),
      })}
    </CardAction>
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
  const shared = useEventPhaseData();

  const ctx: TabRenderContext = {
    event,
    programs,
    mode: canManage ? "edit" : "view",
    shared,
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
        <TabCardActions entry={entry} event={event} canManage={canManage} />
      </CardHeader>
      <CardContent>{entry.render(ctx)}</CardContent>
    </Card>
  );
}

export function EventDetailView(props: {
  event: EventRow;
  programs: Program[];
  canManage: boolean;
  deleteBlockers: string[];
  /**
   * The phases and cards this reader gets, resolved from the permission map on
   * the server (#903) rather than from the module-level constant this file
   * used to import: the map is the server's to read, and the Finance and
   * Inventory cards have to be gone before the markup reaches the browser, not
   * hidden in it.
   */
  phases: EventPhase[];
  initialTab?: TabValue;
  phaseTasks?: Record<PhaseKey, string[]>;
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
  deleteBlockers,
  phases,
  initialTab,
  phaseTasks,
}: {
  event: EventRow;
  programs: Program[];
  canManage: boolean;
  deleteBlockers: string[];
  phases: EventPhase[];
  initialTab?: TabValue;
  phaseTasks?: Record<PhaseKey, string[]>;
}) {
  // ?tab= stays the deep-link entry point (the notification bell and the
  // outstanding-tasks sheet both link with it), but the phase is what the
  // page actually shows, so that's what round-trips through the URL.
  //
  // Both the URL value and the fallback are checked against `phases` rather
  // than against the full PhaseKey union, since #903 dropped a phase with no
  // cards left for this reader. Nothing in the catalog makes that possible
  // today -- every phase holds at least one ungated events card -- but a
  // ?phase= or a ?tab= deep link that selected a phase the strip no longer
  // offers would render an empty page rather than a wrong one.
  const preferred = initialTab ? phaseForTab(initialTab) : "basic";
  const available = (value: string): value is PhaseKey =>
    isPhaseKey(value) && phases.some((phase) => phase.key === value);
  const [phaseKey, setPhaseKey] = useUrlTabState<PhaseKey>({
    param: "phase",
    fallback: available(preferred) ? preferred : (phases[0]?.key ?? "basic"),
    isValid: available,
  });

  // The card within the phase (#958). Resolved against the phase actually on
  // screen, not the whole catalog: `?card=` is one parameter shared by four
  // phases, so a value belonging to another phase has to read as absent
  // rather than as a card this phase cannot show. Same order as the phase
  // above it -- permissions first, then the URL -- since `phase.tabs` has
  // already had this reader's ungated cards removed (#903).
  const cardsHere = phases.find((phase) => phase.key === phaseKey)?.tabs ?? [];
  const inThisPhase = (value: string): value is TabValue =>
    cardsHere.some((tab) => tab.value === value);
  const [cardValue, setCardValue] = useUrlTabState<TabValue>({
    param: "card",
    // `?tab=` remains the deep-link entry point -- the notification bell and
    // the outstanding-tasks sheet both use it -- and it names a card, so it
    // picks the card as well as the phase it opened.
    fallback:
      initialTab && inThisPhase(initialTab)
        ? initialTab
        : (cardsHere[0]?.value ?? "overview"),
    isValid: inThisPhase,
  });

  /** The card a phase opens on when the reader arrives from the phase strip. */
  const firstCardOf = (key: PhaseKey): TabValue =>
    phases.find((phase) => phase.key === key)?.tabs[0]?.value ?? "overview";

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
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
        {canManage && (
          <DeleteEventButton
            eventId={event.id}
            eventName={event.name}
            blockers={deleteBlockers}
          />
        )}
      </div>

      <Tabs
        value={phaseKey}
        onValueChange={(value) =>
          // The card too, in the same write: `?card=` is shared by every
          // phase, so moving to After while it still said `registrants` would
          // leave the URL naming a card that phase does not have. Two setter
          // calls could not do it -- see useUrlTabState.
          setPhaseKey(value as PhaseKey, {
            card: firstCardOf(value as PhaseKey),
          })
        }
        className="mt-6"
      >
        <div className="rainbow-surface rounded-xl border border-[var(--line)] p-4 shadow-md">
          {/* Named because the card strip below is a second tablist on the
              same page, and "Overview" is a phase and a card. */}
          <TabsList
            variant="line"
            aria-label="Event phases"
            className="flex-wrap"
          >
            {phases.map((phase) => (
              <TabsTrigger key={phase.key} value={phase.key}>
                {phase.key === "basic" ? "Overview" : phase.label}
                <PhaseOutstandingBadge tasks={phaseTasks?.[phase.key] ?? []} />
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {phases.map((phase) => (
          <TabsContent key={phase.key} value={phase.key} className="mt-4">
            {/* Base UI unmounts the phases you aren't looking at, so exactly
                one provider is live and each shared read runs once per phase
                rather than once per card. */}
            <EventPhaseDataProvider
              eventId={event.id}
              resources={phase.sharedData}
            >
              {/* The second level (#958). Each phase used to render all of
                  its cards as one stacked column -- six of them on During and
                  After, several holding their own table and toolbar, so the
                  phase tabs solved the tab count and pushed the crowding down
                  a level rather than resolving it. Cards are for parts of one
                  view, and six independent tables are not one view.

                  Pills under the phase strip's underline, so the two levels
                  do not read as one repeated control. */}
              <Tabs
                value={cardValue}
                onValueChange={(value) => setCardValue(value as TabValue)}
              >
                <TabsList
                  variant="default"
                  aria-label={`${phase.label} cards`}
                  className="h-auto flex-wrap"
                >
                  {phase.tabs.map((t) => (
                    <TabsTrigger key={t.value} value={t.value}>
                      {/* The card's own title, not the catalog label: the
                          basic phase is called Overview in the strip above,
                          and a card of the same name under it would be two
                          controls reading as one. */}
                      {CARD_TITLES[t.value] ?? t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {phase.tabs.map((t) => {
                  const entry = entryFor(t.value);
                  const editToggle =
                    entry.kind === "form" ||
                    SELF_MANAGED_EDIT_TABS.has(t.value);
                  const TabCard = editToggle ? EditableTabCard : PlainTabCard;
                  return (
                    <TabsContent key={t.value} value={t.value} className="mt-4">
                      <TabCard
                        entry={entry}
                        title={CARD_TITLES[t.value] ?? t.label}
                        event={event}
                        programs={programs}
                        canManage={canManage}
                      />
                    </TabsContent>
                  );
                })}
              </Tabs>
            </EventPhaseDataProvider>
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
