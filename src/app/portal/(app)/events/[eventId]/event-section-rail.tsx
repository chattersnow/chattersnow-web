"use client";

import { useMemo, useState } from "react";
import { PanelLeftOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
 */
export function EventSectionRail({
  phases,
  current,
  currentTitle,
  cardTasks,
  onSelect,
}: {
  phases: readonly EventPhase[];
  current: TabValue;
  /** The open card's title, so the collapsed rail still says where you are. */
  currentTitle: string;
  /** Outstanding work, by the card it is done on. */
  cardTasks?: Partial<Record<TabValue, string[]>>;
  onSelect: (value: TabValue) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const trimmed = query.trim().toLowerCase();

  const matches = useMemo<Match[]>(() => {
    if (!trimmed) return [];
    return phases.flatMap((phase) =>
      phase.tabs
        .filter((section) =>
          [section.label, phase.label, ...section.keywords].some((field) =>
            field.toLowerCase().includes(trimmed),
          ),
        )
        .map((section) => ({ ...section, group: phase.label })),
    );
  }, [phases, trimmed]);

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mb-3 lg:hidden"
        aria-expanded={open}
        aria-controls="event-section-rail"
        onClick={() => setOpen((current) => !current)}
      >
        <PanelLeftOpen />
        {open ? "Hide sections" : `Sections · ${currentTitle}`}
      </Button>

      <div
        id="event-section-rail"
        className={cn(
          // Clears the portal's own sticky header. The underscores are
          // Tailwind's spaces: `calc(a+b)` without them is invalid CSS and
          // silently drops the offset, which leaves the rail scrolling away.
          "space-y-6 lg:sticky lg:top-[calc(var(--portal-header-height)_+_1.5rem)] lg:block",
          // Nineteen sections under four headings is taller than the viewport,
          // and a sticky box taller than its viewport puts its own foot out of
          // reach. It scrolls itself instead.
          "lg:max-h-[calc(100vh_-_var(--portal-header-height)_-_3rem)] lg:overflow-y-auto",
          !open && "hidden",
        )}
      >
        <div className="relative">
          <Search
            className="app-muted pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this event"
            aria-label="Search this event's sections"
            className="pl-9"
          />
        </div>

        {trimmed ? (
          <nav aria-label="Search results">
            <p className="app-muted mb-2 text-xs">
              {matches.length === 0
                ? "Nothing matches."
                : `${matches.length} section${matches.length === 1 ? "" : "s"}`}
            </p>
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
          </nav>
        ) : (
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
        )}
      </div>
    </div>
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
