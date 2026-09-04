"use client";

import { useState, useTransition } from "react";
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

export function RegistrantsTab({
  capacity,
  mode,
  registrants: registrantsData,
  derived,
}: {
  capacity: number | null;
  mode: "view" | "edit";
  registrants: TabData<EventRegistrant[]>;
  derived: TabData<EventImpactDerived>;
}) {
  const router = useRouter();
  const { data: registrants, loadError } = registrantsData;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [riderTarget, setRiderTarget] = useState<EventRegistrant | null>(null);

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
  const showRides = list.some((registrant) => registrant.rider !== null);

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {registrants !== undefined && (
        <p className="app-muted text-sm">
          {list.length} registration{list.length === 1 ? "" : "s"},{" "}
          {totalAttending} attending
          {capacity !== null && ` of ${capacity} capacity`} &middot;{" "}
          {checkedInCount} checked in
          {derived.data &&
            checkedInCount > 0 &&
            ` · ${derived.data.recurringParticipants} recurring, ${derived.data.firstTimeParticipants} first-time`}
        </p>
      )}

      {registrants === undefined ? (
        <TabLoadingSkeleton />
      ) : list.length === 0 ? (
        <EmptyState
          title="No one has registered yet"
          description="Registrations arrive from the public event page. Walk-ins can be added with + Add registrant or + Check in walk-in above."
        />
      ) : (
        <Table stickyFirstColumn>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead hideBelow="md">Contact</TableHead>
              <TableHead hideBelow="sm">Party size</TableHead>
              <TableHead hideBelow="lg">Registered</TableHead>
              {showRides && <TableHead hideBelow="lg">Rides</TableHead>}
              <TableHead>Checked in</TableHead>
              {mode === "edit" && <TableHead className="w-px" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((registrant) => (
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
                <TableCell
                  hideBelow="lg"
                  className="app-muted whitespace-nowrap"
                >
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
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Keyed so the form re-seeds from whichever registrant was opened. */}
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
