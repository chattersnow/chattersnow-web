"use client";

import { useMemo } from "react";
import { BellOff } from "lucide-react";
import { PortalRail, PortalRailResults } from "@/components/portal/portal-rail";
import { cn } from "@/lib/utils";
import type { DeviceClass } from "@/proxy";

/** One reply as the rail lists it. */
export type RailEntry = {
  kind: string;
  label: string;
  /** The registry's module key: events, volunteers, inventory, ... */
  module: string;
  description: string;
  enabled: boolean;
  /** How many of its slots this tenant has rewritten. */
  customized: number;
  /** The reply's current wording, so the search box can reach into it. */
  text: string;
};

/**
 * The module a reply belongs to, as a heading.
 *
 * Hard-coded rather than read through `lexicon.*`, the same way `nav.ts`'s own
 * headings are: these name the portal's sections, and a tenant that renames
 * "volunteers" renames what it lends, not the module it lends it from.
 */
const MODULE_LABELS: Record<string, string> = {
  events: "Events",
  volunteers: "Volunteers",
  inventory: "Inventory",
  communications: "Communications",
  artwork: "Artwork",
};

function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module;
}

type RailProps = {
  device: DeviceClass;
  entries: readonly RailEntry[];
  active: string;
  /** The reply with unsaved edits, if any, so the rail can say so. */
  dirtyKind: string | null;
  onSelect: (kind: string) => void;
};

/**
 * The list of automatic replies, grouped by the module whose form sends them.
 *
 * `PortalRail` rather than a third answer of its own: Site Content and event
 * detail are the two reference implementations and this is the same shape --
 * a list on the left, the selected thing's editor on the right, the selection
 * in the URL (`docs/portal-navigation.md`). Fewer parts than the rail's
 * "roughly ten" threshold today, and deliberately so: #1237 adds two more
 * replies and #1236 puts a preview pane beside the editor, and the column the
 * rail collapses into on a phone is what leaves room for it.
 */
export function AutoReplyRail({ device, active, ...rest }: RailProps) {
  const current = rest.entries.find((entry) => entry.kind === active);
  return (
    <PortalRail
      id="automatic-replies-rail"
      device={device}
      label={`Replies · ${current?.label ?? "Automatic Replies"}`}
      hideLabel="Hide replies"
      title="Automatic replies"
      description="Every email your public forms send back, and a search over what they say."
      searchLabel="Search automatic replies"
      searchPlaceholder="Search automatic replies"
    >
      {({ query, close }) => (
        <RailBody active={active} query={query} close={close} {...rest} />
      )}
    </PortalRail>
  );
}

function RailBody({
  entries,
  active,
  dirtyKind,
  onSelect,
  query,
  close,
}: Omit<RailProps, "device"> & {
  query: string;
  close: (after?: () => void) => void;
}) {
  const groups = useMemo(() => {
    const byModule = new Map<string, RailEntry[]>();
    for (const entry of entries) {
      const list = byModule.get(entry.module) ?? [];
      list.push(entry);
      byModule.set(entry.module, list);
    }
    return [...byModule].map(([module, items]) => ({ module, items }));
  }, [entries]);

  const matches = useMemo(() => {
    if (!query) return [];
    return entries.filter((entry) =>
      [entry.label, entry.description, entry.text, moduleLabel(entry.module)]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [entries, query]);

  // Selecting closes the sheet on a phone, and the selection re-renders the
  // pane behind it -- nothing has to be measured or focused there, so it runs
  // alongside the close rather than after it.
  const select = (kind: string) => {
    onSelect(kind);
    close();
  };

  const row = (entry: RailEntry) => (
    <li key={entry.kind}>
      <button
        type="button"
        aria-current={entry.kind === active ? "true" : undefined}
        onClick={() => select(entry.kind)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
          entry.kind === active
            ? "bg-[var(--purple-soft)] font-semibold text-[var(--purple-deep)]"
            : "hover:bg-[var(--purple-soft)]",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        {!entry.enabled && (
          <BellOff className="app-muted size-3.5 shrink-0" aria-label="Off" />
        )}
        {dirtyKind === entry.kind ? (
          <span className="text-[var(--purple)] shrink-0 text-xs">Unsaved</span>
        ) : (
          entry.customized > 0 && (
            <span
              className="app-muted shrink-0 text-xs tabular-nums"
              title="Fields you have written yourself"
            >
              {entry.customized}
            </span>
          )
        )}
      </button>
    </li>
  );

  if (query) {
    return (
      // "email", not "reply": PortalRailResults pluralizes with an `s`.
      <PortalRailResults count={matches.length} noun="email">
        <ul className="space-y-1">{matches.map(row)}</ul>
      </PortalRailResults>
    );
  }

  return (
    <nav aria-label="Automatic replies">
      <ul className="space-y-4">
        {groups.map((group) => (
          <li key={group.module}>
            <span className="app-muted block px-2 text-xs font-semibold">
              {moduleLabel(group.module)}
            </span>
            <ul className="mt-1 space-y-0.5">{group.items.map(row)}</ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
