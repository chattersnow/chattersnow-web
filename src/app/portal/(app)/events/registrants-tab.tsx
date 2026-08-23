"use client";

import { useEffect, useState } from "react";
import { listEventRegistrantsAction, type EventRegistrant } from "./registrants-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function RegistrantsTab({
  eventId,
  capacity,
  active,
}: {
  eventId: string;
  capacity: number | null;
  active: boolean;
}) {
  const [registrants, setRegistrants] = useState<EventRegistrant[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    listEventRegistrantsAction(eventId).then((result) => {
      if ("error" in result) setLoadError(result.error);
      else {
        setLoadError(null);
        setRegistrants(result.data);
      }
    });
  }, [active, eventId]);

  const totalAttending = registrants?.reduce((sum, registrant) => sum + registrant.party_size, 0) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {registrants !== null && (
        <p className="app-muted text-sm">
          {registrants.length} registration{registrants.length === 1 ? "" : "s"}, {totalAttending} attending
          {capacity !== null && ` of ${capacity} capacity`}
        </p>
      )}

      {registrants === null ? (
        <p className="app-muted text-sm">Loading registrants...</p>
      ) : registrants.length === 0 ? (
        <p className="app-muted text-sm">No one has registered yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Party size</TableHead>
              <TableHead>Registered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {registrants.map((registrant) => (
              <TableRow key={registrant.id}>
                <TableCell className="font-medium">{registrant.name}</TableCell>
                <TableCell className="app-muted">
                  {registrant.email}
                  {registrant.phone && <span className="block text-xs">{registrant.phone}</span>}
                </TableCell>
                <TableCell>{registrant.party_size}</TableCell>
                <TableCell className="app-muted whitespace-nowrap">
                  {dateFormatter.format(new Date(registrant.created_at))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
