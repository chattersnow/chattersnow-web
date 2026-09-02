"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import {
  deleteEventIncidentAction,
  listEventIncidentsAction,
  type EventIncident,
} from "./incidents-actions";
import { SeverityBadge } from "./event-badges";
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
import { Spinner } from "@/components/ui/spinner";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function IncidentsTab({
  eventId,
  active,
  mode,
}: {
  eventId: string;
  active: boolean;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const [incidents, setIncidents] = useState<EventIncident[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  function load() {
    listEventIncidentsAction(eventId).then((result) => {
      if ("error" in result) setLoadError(result.error);
      else {
        setLoadError(null);
        setIncidents(result.data);
      }
    });
  }

  useEffect(() => {
    if (!active) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, eventId]);

  function refresh() {
    load();
    router.refresh();
  }

  useRegisterTabRefresh<TabValue>("incidents", refresh);

  function handleDelete(id: string) {
    startDeleteTransition(async () => {
      await deleteEventIncidentAction(id);
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {incidents === null ? (
        <TabLoadingSkeleton />
      ) : incidents.length === 0 ? (
        <p className="app-muted text-sm">No incidents recorded.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-px" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {incidents?.map((incident) => (
              <TableRow key={incident.id}>
                <TableCell className="app-muted whitespace-nowrap">
                  {dateFormatter.format(new Date(incident.occurred_at))}
                </TableCell>
                <TableCell>
                  <SeverityBadge severity={incident.severity} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  {incident.description}
                </TableCell>
                <TableCell className="text-right">
                  {mode === "edit" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove incident"
                      disabled={isDeleting}
                      onClick={() => handleDelete(incident.id)}
                    >
                      {isDeleting ? <Spinner /> : <Trash2 />}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
