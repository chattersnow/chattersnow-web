"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

/**
 * The table itself, rendered twice: capped in the card, in full in the sheet.
 *
 * Everything it needs is passed in, so both copies drive the same pending row
 * and the same rider dialog rather than keeping two sets of state that can
 * disagree about what is in flight.
 */
function RegistrantsTable({
  rows,
  mode,
  showRides,
  pendingId,
  isPending,
  stickyHeader = false,
  onToggleCheckIn,
  onOpenRider,
}: {
  rows: EventRegistrant[];
  mode: "view" | "edit";
  showRides: boolean;
  pendingId: string | null;
  isPending: boolean;
  /** Pins the header while the sheet's own body scrolls. */
  stickyHeader?: boolean;
  onToggleCheckIn: (registrant: EventRegistrant) => void;
  onOpenRider: (registrant: EventRegistrant) => void;
}) {
  return (
    <Table stickyFirstColumn>
      <TableHeader
        className={stickyHeader ? "sticky top-0 z-10 bg-popover" : undefined}
      >
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead hideBelow="md">Contact</TableHead>
          <TableHead hideBelow="sm">Party size</TableHead>
          <TableHead hideBelow="lg">Registered</TableHead>
          {showRides && <TableHead hideBelow="lg">Rides</TableHead>}
          <TableHead>Checked in</TableHead>
          {mode === "edit" && (
            <TableHead className="w-px">
              <span className="sr-only">Actions</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((registrant) => (
          <TableRow key={registrant.id}>
            <TableCell
              className="max-w-xs truncate font-medium"
              title={registrant.name}
            >
              {registrant.name}
            </TableCell>
            <TableCell hideBelow="md" className="app-muted">
              {registrant.email}
              {registrant.phone && (
                <span className="block text-xs">{registrant.phone}</span>
              )}
            </TableCell>
            <TableCell hideBelow="sm">{registrant.party_size}</TableCell>
            <TableCell hideBelow="lg" className="app-muted whitespace-nowrap">
              {formatDateTime(registrant.created_at)}
            </TableCell>
            {showRides && (
              <TableCell hideBelow="lg" className="app-muted">
                {ridesSummary(registrant) ?? "—"}
              </TableCell>
            )}
            <TableCell className="app-muted whitespace-nowrap">
              {formatDateTime(registrant.checked_in_at)}
            </TableCell>
            {mode === "edit" && (
              <TableCell className="text-right whitespace-nowrap">
                {/* The profile hangs off the person record, so a
                    registration never linked to one has nowhere to put it —
                    link it from the People module first. */}
                {registrant.rider && registrant.person_id && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Rider profile for ${registrant.name}`}
                    onClick={() => onOpenRider(registrant)}
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
                  onClick={() => onToggleCheckIn(registrant)}
                >
                  {registrant.checked_in_at ? <Undo2 /> : <Check />}
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [riderTarget, setRiderTarget] = useState<EventRegistrant | null>(null);
  const [query, setQuery] = useState("");

  function refreshAll() {
    registrantsData.refresh();
    derived.refresh();
    router.refresh();
  }

  function handleToggleCheckIn(registrant: EventRegistrant) {
    setPendingId(registrant.id);
    startTransition(async () => {
      const action = registrant.checked_in_at
        ? undoCheckInAction
        : checkInRegistrantAction;
      await action(registrant.id);
      setPendingId(null);
      refreshAll();
    });
  }

  const list = registrants ?? [];
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

  const capped = previewRows === null ? list : list.slice(0, previewRows);
  const hasOverflow = previewRows !== null && list.length > previewRows;

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

  const tableProps = {
    mode,
    showRides,
    pendingId,
    isPending,
    onToggleCheckIn: handleToggleCheckIn,
    onOpenRider: setRiderTarget,
  };

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
          <RegistrantsTable rows={capped} {...tableProps} />

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
              {filtered.length === 0 ? (
                <EmptyState
                  title="No matching registrants"
                  description="Clear or loosen the search to see more."
                />
              ) : (
                <RegistrantsTable
                  rows={filtered}
                  stickyHeader
                  {...tableProps}
                />
              )}
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
