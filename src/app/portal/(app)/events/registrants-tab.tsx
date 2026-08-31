"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Undo2 } from "lucide-react";
import {
  checkInRegistrantAction,
  listEventRegistrantsAction,
  undoCheckInAction,
  type EventRegistrant,
} from "./registrants-actions";
import { useTabData } from "@/hooks/use-tab-data";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
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

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function RegistrantsTab({
  eventId,
  capacity,
  active,
  mode,
}: {
  eventId: string;
  capacity: number | null;
  active: boolean;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const {
    data: registrants,
    loadError,
    refresh,
  } = useTabData<EventRegistrant[]>(
    () => listEventRegistrantsAction(eventId),
    active,
    [eventId],
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refreshAll() {
    refresh();
    router.refresh();
  }

  useRegisterTabRefresh<TabValue>("registrants", refreshAll);

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
        </p>
      )}

      {registrants === undefined ? (
        <TabLoadingSkeleton />
      ) : list.length === 0 ? (
        <p className="app-muted text-sm">No one has registered yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Party size</TableHead>
              <TableHead>Registered</TableHead>
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
                <TableCell className="app-muted">
                  {registrant.email}
                  {registrant.phone && (
                    <span className="block text-xs">{registrant.phone}</span>
                  )}
                </TableCell>
                <TableCell>{registrant.party_size}</TableCell>
                <TableCell className="app-muted whitespace-nowrap">
                  {dateFormatter.format(new Date(registrant.created_at))}
                </TableCell>
                <TableCell className="app-muted whitespace-nowrap">
                  {registrant.checked_in_at
                    ? dateFormatter.format(new Date(registrant.checked_in_at))
                    : "—"}
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
