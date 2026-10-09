"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type GearFacetOption = { key: string; label: string; count: number };

/** A heading inside a facet's list, as the Type facet's category groups are. */
export type GearFacetGroup = {
  key: string;
  label: string | null;
  options: GearFacetOption[];
};

/**
 * One filter dimension. Single-select, as the catalog has always been: picking
 * an option replaces the facet's value and picking it again clears it.
 *
 * Each `count` is how many items that option would show given the search and
 * every *other* facet's current value, so the numbers answer "what do I get if
 * I click this" rather than restating the catalog's totals.
 */
export type GearFacet = {
  id: string;
  label: string;
  allLabel: string;
  /** What "All" would show: the search and the other facets, not this one. */
  total: number;
  value: string | null;
  groups: GearFacetGroup[];
  onChange: (value: string | null) => void;
};

/**
 * The catalog's filters as a list a reader can scan, each option with how
 * many items it holds. Rendered as a rail beside the grid on wide screens and
 * inside the Filters sheet on narrow ones -- the same component in both, so
 * the two never disagree about what is on offer.
 */
export function GearFilterRail({
  facets,
  activeCount,
  onClear,
}: {
  facets: GearFacet[];
  activeCount: number;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {facets.map((facet) => (
        <FacetList key={facet.id} facet={facet} />
      ))}
      {activeCount > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={onClear}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}

function FacetList({ facet }: { facet: GearFacet }) {
  const headingId = `gear-facet-${facet.id}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h2
        id={headingId}
        className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
      >
        {facet.label}
      </h2>
      <ul className="flex flex-col">
        <FacetRow
          label={facet.allLabel}
          count={facet.total}
          selected={facet.value === null}
          onSelect={() => facet.onChange(null)}
        />
        {facet.groups.map((group) => {
          // An option with nothing to show is left out rather than offered as
          // a dead end -- unless it is the current choice, which has to stay
          // visible so the reader can see it and undo it.
          const options = group.options.filter(
            (option) => option.count > 0 || option.key === facet.value,
          );
          if (options.length === 0) return null;
          return (
            <li key={group.key}>
              {group.label && (
                <p className="app-muted mt-2 px-2 text-xs font-medium">
                  {group.label}
                </p>
              )}
              <ul className="flex flex-col">
                {options.map((option) => (
                  <FacetRow
                    key={option.key}
                    label={option.label}
                    count={option.count}
                    selected={facet.value === option.key}
                    onSelect={() =>
                      facet.onChange(
                        facet.value === option.key ? null : option.key,
                      )
                    }
                  />
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FacetRow({
  label,
  count,
  selected,
  onSelect,
}: {
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selected && "bg-muted font-semibold",
        )}
      >
        <span className="min-w-0 flex-1 break-words">{label}</span>
        <span className="app-muted text-xs tabular-nums">{count}</span>
      </button>
    </li>
  );
}
