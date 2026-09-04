"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Undo2 } from "lucide-react";
import {
  checkInRegistrantAction,
  undoCheckInAction,
  type EventRegistrant,
} from "./registrants-actions";
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
                <TableCell className="app-muted whitespace-nowrap">
                  {formatDateTime(registrant.checked_in_at)}
                </TableCell>
                {mode === "edit" && (
                  <TableCell className="text-right whitespace-nowrap">
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
    </div>
  );
}
