"use client";

import { useMemo } from "react";
import { PortalRail, PortalRailResults } from "@/components/portal/portal-rail";
import { cn } from "@/lib/utils";
import type { DeviceClass } from "@/proxy";
import { permissionDocFor } from "@/lib/auth/permission-docs";
import type { PermissionResourceRow } from "@/components/portal/permission-resource-doc";

type RailProps = {
  device: DeviceClass;
  resources: readonly PermissionResourceRow[];
  /** Resource keys whose module this organization does not have. */
  inertKeys: ReadonlySet<string>;
  /** The resource nearest the top of the page, for `aria-current`. */
  active: string | null;
  onJump: (key: string) => void;
};

/**
 * The catalog as an outline beside the page (#1334).
 *
 * `PortalRail` rather than the page's own filter box, which is what shipped
 * with #1324: 35 resources under ten headings is past the "roughly ten parts"
 * threshold in `docs/portal-navigation.md`, and a filter alone answered "which
 * one covers expenses?" while answering nothing about what the page held or
 * where in it the reader was standing. Site Content's outline is the shape
 * this copies -- a list on the left, the whole document on the right, and a
 * jump rather than a selection, because the page is meant to be read through
 * as well as searched.
 *
 * Search reaches into the prose, not just the labels. "approve" should find
 * Expense approvals whether or not the word is in its name, which is the
 * same reason Site Content searches every page's copy rather than its titles.
 */
export function PermissionReferenceRail({
  device,
  active,
  resources,
  ...rest
}: RailProps) {
  const current = resources.find((resource) => resource.key === active);
  return (
    <PortalRail
      id="permission-reference-rail"
      device={device}
      // Named after where the reader is, like the other two rails.
      label={`Permissions · ${current?.label ?? "All"}`}
      hideLabel="Hide permissions"
      title="Permissions"
      description="Every permission in this organization's matrix, and a search over what each one grants."
      searchLabel="Search permissions"
      searchPlaceholder="Search permissions"
    >
      {({ query, close }) => (
        <RailBody
          active={active}
          resources={resources}
          query={query}
          close={close}
          {...rest}
        />
      )}
    </PortalRail>
  );
}

/** Everything written about one resource, flattened for the search box. */
function haystack(resource: PermissionResourceRow): string {
  const doc = permissionDocFor(resource.key);
  return [
    resource.key,
    resource.label,
    resource.section,
    resource.description ?? "",
    doc?.view ?? "",
    doc?.manage ?? "",
    ...(doc?.excludes ?? []).map(
      (exclusion) => `${exclusion.key} ${exclusion.covers}`,
    ),
    ...(doc?.notes ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function RailBody({
  resources,
  inertKeys,
  active,
  onJump,
  query,
  close,
}: Omit<RailProps, "device"> & {
  query: string;
  close: (after?: () => void) => void;
}) {
  const groups = useMemo(() => {
    const bySection = new Map<string, PermissionResourceRow[]>();
    for (const resource of resources) {
      const list = bySection.get(resource.section) ?? [];
      list.push(resource);
      bySection.set(resource.section, list);
    }
    return [...bySection].map(([section, items]) => ({ section, items }));
  }, [resources]);

  const matches = useMemo(() => {
    if (!query) return [];
    return resources.filter((resource) => haystack(resource).includes(query));
  }, [resources, query]);

  // A jump scrolls the page behind the rail and moves focus there, so on a
  // phone it has to wait for the sheet to be really gone -- what `close`'s
  // callback is for.
  const jump = (key: string) => close(() => onJump(key));

  const row = (resource: PermissionResourceRow, withSection = false) => (
    <li key={resource.key}>
      <button
        type="button"
        aria-current={resource.key === active ? "true" : undefined}
        onClick={() => jump(resource.key)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
          resource.key === active
            ? "bg-[var(--purple-soft)] font-semibold text-[var(--purple-deep)]"
            : "hover:bg-[var(--purple-soft)]",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate">{resource.label}</span>
          {withSection && (
            <span className="app-muted block truncate text-xs">
              {resource.section}
            </span>
          )}
        </span>
        {inertKeys.has(resource.key) && (
          <span
            className="app-muted shrink-0 text-xs"
            title="The module this belongs to is off, so the grant does nothing"
          >
            Off
          </span>
        )}
      </button>
    </li>
  );

  if (query) {
    return (
      <PortalRailResults count={matches.length} noun="permission">
        <ul className="space-y-1">
          {matches.map((resource) => row(resource, true))}
        </ul>
      </PortalRailResults>
    );
  }

  return (
    <nav aria-label="Permissions">
      <ul className="space-y-4">
        {groups.map((group) => (
          <li key={group.section}>
            <span className="app-muted block px-2 text-xs font-semibold">
              {group.section}
            </span>
            <ul className="mt-1 space-y-0.5">
              {group.items.map((resource) => row(resource))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="app-muted mt-3 px-2 text-xs">
        Searching reaches into what each permission grants, not just its name.
      </p>
    </nav>
  );
}
