"use client";

import {
  useCallback,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Check, Snowflake, Undo2 } from "lucide-react";
import {
  checkInRegistrantAction,
  undoCheckInAction,
  type EventRegistrant,
} from "./registrants-actions";
import { RiderProfileDialog } from "./rider-profile-dialog";
import {
  experienceLevelLabel,
  ridingDisciplineLabel,
} from "@/lib/rider-profile";
import type { EventImpactDerived } from "@/lib/portal/impact-metrics";
import type { TabData } from "@/hooks/use-tab-data";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  PortalDataTable,
  withoutSorting,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import {
  LIST_PREVIEW_ROWS,
  ListPreviewSheet,
} from "@/components/portal/list-preview-sheet";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

/**
 * What the door sees in the Rides column.
 *
 * Reads the level snapshotted at check-in, falling back to the person's current
 * profile only when there is no snapshot at all — the same all-or-nothing rule
 * the impact RPCs apply, so the column and the Impact card's beginner figure can
 * never disagree.
 */
function ridesSummary(registrant: EventRegistrant): string | null {
  const rider = registrant.rider;
  if (!rider) return null;

  const snapshot = rider.riding_discipline_at_event !== null;
  const discipline = ridingDisciplineLabel(
    snapshot ? rider.riding_discipline_at_event : rider.riding_discipline,
  );
  if (!discipline) return null;

  const levels = [
    experienceLevelLabel(
      snapshot
        ? rider.ski_experience_level_at_event
        : rider.ski_experience_level,
    ),
    experienceLevelLabel(
      snapshot
        ? rider.snowboard_experience_level_at_event
        : rider.snowboard_experience_level,
    ),
  ].filter((level): level is string => level !== null);

  const distinct = [...new Set(levels)];
  return distinct.length > 0
    ? `${discipline} · ${distinct.join(" / ")}`
    : discipline;
}

function matchesQuery(registrant: EventRegistrant, needle: string): boolean {
  return [registrant.name, registrant.email, registrant.phone].some(
    (field) => field?.toLowerCase().includes(needle) ?? false,
  );
}

export function RegistrantsTab({
  capacity,
  mode,
  registrants: registrantsData,
  derived,
  previewRows = LIST_PREVIEW_ROWS,
  headerActions,
}: {
  capacity: number | null;
  mode: "view" | "edit";
  registrants: TabData<EventRegistrant[]>;
  derived: TabData<EventImpactDerived>;
  /**
   * Rows shown before the rest move behind "View all". `null` renders the whole
   * list with no trigger — which is what the Happening Now check-in sheet needs,
   * since capping the list there would hide the very rows it exists to work
   * through, and its trigger would open a sheet inside a sheet. Numeric
   * overrides keep tests from having to build six registrants.
   */
  previewRows?: number | null;
  /** Create actions mirrored into the sheet header. */
  headerActions?: ReactNode;
}) {
  const router = useRouter();
  const { data: registrants, loadError } = registrantsData;
  const refreshRegistrants = registrantsData.refresh;
  const refreshDerived = derived.refresh;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [riderTarget, setRiderTarget] = useState<EventRegistrant | null>(null);
  const [query, setQuery] = useState("");

  // Stable, so the column list below only rebuilds when something it renders
  // differently changes.
  const refreshAll = useCallback(() => {
    refreshRegistrants();
    refreshDerived();
    router.refresh();
  }, [refreshRegistrants, refreshDerived, router]);

  const handleToggleCheckIn = useCallback(
    (registrant: EventRegistrant) => {
      setPendingId(registrant.id);
      startTransition(async () => {
        const action = registrant.checked_in_at
          ? undoCheckInAction
          : checkInRegistrantAction;
        await action(registrant.id);
        setPendingId(null);
        refreshAll();
      });
    },
    [refreshAll],
  );

  const list = useMemo(() => registrants ?? [], [registrants]);
  const totalAttending = list.reduce(
    (sum, registrant) => sum + registrant.party_size,
    0,
  );
  const checkedInCount = list.filter((r) => r.checked_in_at !== null).length;
  // Null across the board means this viewer isn't cleared for rider data.
  // Derived from the whole list, not the preview slice, so the column doesn't
  // appear and disappear between the card and the sheet.
  const showRides = list.some((registrant) => registrant.rider !== null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((registrant) => matchesQuery(registrant, needle));
  }, [list, query]);

  const columns = useMemo<PortalDataTableColumn<EventRegistrant>[]>(
    () => [
      {
        key: "name",
        label: "Name",
        sortValue: (registrant) => registrant.name,
        cellClassName: "max-w-xs font-medium",
        render: (registrant) => (
          <>
            <span className="block truncate" title={registrant.name}>
              {registrant.name}
            </span>
            {/* Under the name rather than in a column of its own: the door
                reads it at the same moment it reads who this is, and the
                table is already wide enough to drop columns on small
                screens. */}
            {registrant.pronouns && (
              <span className="app-muted block truncate text-xs font-normal">
                {registrant.pronouns}
              </span>
            )}
          </>
        ),
      },
      {
        key: "contact",
        label: "Contact",
        sortValue: (registrant) => registrant.email,
        hideBelow: "md",
        cellClassName: "app-muted",
        render: (registrant) => (
          <>
            {registrant.email}
            {registrant.phone && (
              <span className="block text-xs">{registrant.phone}</span>
            )}
          </>
        ),
      },
      {
        key: "party_size",
        label: "Party size",
        sortValue: (registrant) => registrant.party_size,
        hideBelow: "sm",
        render: (registrant) => registrant.party_size,
      },
      {
        key: "created_at",
        label: "Registered",
        sortValue: (registrant) => registrant.created_at,
        hideBelow: "lg",
        cellClassName: "app-muted whitespace-nowrap",
        render: (registrant) => formatDateTime(registrant.created_at),
      },
      ...(showRides
        ? [
            {
              key: "rides",
              label: "Rides",
              sortValue: (registrant: EventRegistrant) =>
                ridesSummary(registrant),
              hideBelow: "lg",
              cellClassName: "app-muted",
              render: (registrant: EventRegistrant) =>
                ridesSummary(registrant) ?? "—",
            } satisfies PortalDataTableColumn<EventRegistrant>,
          ]
        : []),
      {
        key: "checked_in_at",
        label: "Checked in",
        sortValue: (registrant) => registrant.checked_in_at,
        cellClassName: "app-muted whitespace-nowrap",
        render: (registrant) => formatDateTime(registrant.checked_in_at),
      },
      ...(mode === "edit"
        ? [
            {
              key: "actions",
              label: "Actions",
              srOnlyLabel: true,
              headClassName: "w-0",
              cellClassName: "text-right whitespace-nowrap",
              render: (registrant: EventRegistrant) => (
                <>
                  {/* The profile hangs off the person record, so a
                      registration never linked to one has nowhere to put it —
                      link it from the People module first. */}
                  {registrant.rider && registrant.person_id && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Rider profile for ${registrant.name}`}
                      onClick={() => setRiderTarget(registrant)}
                    >
                      <Snowflake />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={
                      registrant.checked_in_at ? "Undo check-in" : "Check in"
                    }
                    disabled={isPending && pendingId === registrant.id}
                    onClick={() => handleToggleCheckIn(registrant)}
                  >
                    {registrant.checked_in_at ? <Undo2 /> : <Check />}
                  </Button>
                </>
              ),
            } satisfies PortalDataTableColumn<EventRegistrant>,
          ]
        : []),
    ],
    [showRides, mode, isPending, pendingId, handleToggleCheckIn],
  );

  // Only the copy that holds every row may claim to order them; see
  // `withoutSorting`.
  const previewColumns = useMemo(() => withoutSorting(columns), [columns]);

  const capped = previewRows === null ? list : list.slice(0, previewRows);
  const hasOverflow = previewRows !== null && list.length > previewRows;
  const previewIsWholeList = !hasOverflow;

  const summary =
    registrants === undefined ? null : (
      <>
        {list.length} registration{list.length === 1 ? "" : "s"},{" "}
        {totalAttending} attending
        {capacity !== null && ` of ${capacity} capacity`} &middot;{" "}
        {checkedInCount} checked in
        {derived.data &&
          checkedInCount > 0 &&
          ` · ${derived.data.recurringParticipants} recurring, ${derived.data.firstTimeParticipants} first-time`}
      </>
    );

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {summary && <p className="app-muted text-sm">{summary}</p>}

      {registrants === undefined ? (
        <TabLoadingSkeleton />
      ) : list.length === 0 ? (
        <EmptyState
          title="No one has registered yet"
          description="Registrations arrive from the public event page. Walk-ins can be added with + Add registrant or + Check in walk-in above."
        />
      ) : (
        <>
          <PortalDataTable
            columns={previewIsWholeList ? columns : previewColumns}
            rows={capped}
            getRowKey={(registrant) => registrant.id}
            // listEventRegistrantsAction returns them in the order they
            // registered.
            defaultSort={
              previewIsWholeList ? { key: "created_at", dir: "asc" } : undefined
            }
            emptyMessage="No registrants to show."
            // The tab is already inside its own card on the phase grid -- and
            // inside the check-in sheet, which brings its own surface.
            shell="bare"
            stickyFirstColumn
          />

          {hasOverflow && (
            <ListPreviewSheet
              title="Registrants"
              description={summary}
              triggerLabel={`View all ${list.length} registrants`}
              searchPlaceholder="Search name, email, or phone"
              searchLabel="Search registrants"
              query={query}
              onQueryChange={setQuery}
              totalCount={list.length}
              filteredCount={filtered.length}
              actions={headerActions}
            >
              <PortalDataTable
                columns={columns}
                rows={filtered}
                getRowKey={(registrant) => registrant.id}
                defaultSort={{ key: "created_at", dir: "asc" }}
                emptyMessage="No registrants match your search. Clear or loosen it to see more."
                // The sheet body is the scroller here and brings its own
                // surface, so the header pins to the top of that rather than
                // to the portal's header.
                shell="bare"
                stickyHeader="container"
                stickyFirstColumn
              />
            </ListPreviewSheet>
          )}
        </>
      )}

      {/* Keyed so the form re-seeds from whichever registrant was opened.
          Rendered as a sibling of the sheet, not inside it: the house pattern
          for a second overlay, and it keeps the sheet standing behind the
          dialog so closing the profile returns you to your place in the list. */}
      {riderTarget && (
        <RiderProfileDialog
          key={riderTarget.id}
          registrant={riderTarget}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setRiderTarget(null);
          }}
          onSaved={refreshAll}
        />
      )}
    </div>
  );
}
