"use client";

import { useMemo } from "react";
import { PortalRail, PortalRailResults } from "@/components/portal/portal-rail";
import { cn } from "@/lib/utils";
import type { DeviceClass } from "@/proxy";
import { OutstandingBadge } from "../event-badges";
import type { EventPhase, EventSection, TabValue } from "../event-tabs-config";

type Match = EventSection & { group: string };

/**
 * The event's sections, all of them, in one list.
 *
 * Event detail used to put its 19 cards behind four phase tabs (#958). The
 * phases are a real grouping -- most of the During cards genuinely only matter
 * on the day -- but making the reader *select* one charged two things for it.
 * Nothing on screen said which phase held Sponsors or Discount codes, so
 * finding a card you had not used lately meant opening phases until it turned
 * up; and the lifecycle is not one-way, so a coordinator correcting the budget
 * or the venue a week after the event was working against a control that models
 * the job as a sequence.
 *
 * So the phases stay as headings and stop being controls, and search runs over
 * every section at once -- with `keywords` behind it, since "budget" is on a
 * card called Registration & planning and "raffle" is on one called Giveaway.
 *
 * The disclosure, the sticky column and the sheet a phone gets are
 * `PortalRail`'s (#1093); what is left here is what this event lists.
 */
export function EventSectionRail({
  device,
  phases,
  current,
  currentTitle,
  cardTasks,
  onSelect,
}: {
  device: DeviceClass;
  phases: readonly EventPhase[];
  current: TabValue;
  /** The open card's title, so the closed rail still says where you are. */
  currentTitle: string;
  /** Outstanding work, by the card it is done on. */
  cardTasks?: Partial<Record<TabValue, string[]>>;
  onSelect: (value: TabValue) => void;
}) {
  return (
    <PortalRail
      id="event-section-rail"
      device={device}
      label={`Sections · ${currentTitle}`}
      hideLabel="Hide sections"
      title="Sections"
      description="Every part of this event, grouped by when it matters."
      searchLabel="Search this event's sections"
      searchPlaceholder="Search this event"
    >
      {({ query, close }) => (
        <RailBody
          phases={phases}
          current={current}
          cardTasks={cardTasks}
          query={query}
          // Picking closes the rail: on a phone the sheet is over the card the
          // reader just asked for, and above `lg` the column is up regardless.
          onSelect={(value) => close(() => onSelect(value))}
        />
      )}
    </PortalRail>
  );
}

function RailBody({
  phases,
  current,
  cardTasks,
  query,
  onSelect,
}: {
  phases: readonly EventPhase[];
  current: TabValue;
  cardTasks?: Partial<Record<TabValue, string[]>>;
  query: string;
  onSelect: (value: TabValue) => void;
}) {
  const matches = useMemo<Match[]>(() => {
    if (!query) return [];
    return phases.flatMap((phase) =>
      phase.tabs
        .filter((section) =>
          [section.label, phase.label, ...section.keywords].some((field) =>
            field.toLowerCase().includes(query),
          ),
        )
        .map((section) => ({ ...section, group: phase.label })),
    );
  }, [phases, query]);

  if (query) {
    return (
      <PortalRailResults count={matches.length} noun="section">
        <ul className="space-y-0.5">
          {matches.map((match) => (
            <li key={match.value}>
              <SectionRow
                label={match.label}
                trail={match.group}
                current={match.value === current}
                tasks={cardTasks?.[match.value]}
                onSelect={() => onSelect(match.value)}
              />
            </li>
          ))}
        </ul>
      </PortalRailResults>
    );
  }

  return (
    <nav aria-label="Event sections">
      <ul className="space-y-4">
        {phases.map((phase) => (
          <li key={phase.key}>
            <span className="app-eyebrow px-2">{phase.label}</span>
            <ul className="mt-1 space-y-0.5">
              {phase.tabs.map((section) => (
                <li key={section.value}>
                  <SectionRow
                    label={section.label}
                    current={section.value === current}
                    tasks={cardTasks?.[section.value]}
                    onSelect={() => onSelect(section.value)}
                  />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SectionRow({
  label,
  trail,
  current,
  tasks,
  onSelect,
}: {
  label: string;
  /** The group heading, shown only in search results where there are none. */
  trail?: string;
  current: boolean;
  tasks?: string[];
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      // "page" rather than "true": the rail is navigation within the event and
      // the section it points at is what the main column is showing.
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
        current
          ? "bg-[var(--purple-soft)] font-semibold text-[var(--purple-deep)]"
          : "hover:bg-[var(--purple-soft)]",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {trail && <span className="app-muted block text-xs">{trail}</span>}
      </span>
      <OutstandingBadge tasks={tasks ?? []} />
    </button>
  );
}
