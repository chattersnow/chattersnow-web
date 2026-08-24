"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteVolunteerHoursAction, type VolunteerHoursEntry } from "./actions";
import { VolunteerHoursDetailsSheet } from "./volunteer-hours-details-sheet";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function HoursTable({ entries, canManage }: { entries: VolunteerHoursEntry[]; canManage: boolean }) {
  const router = useRouter();
  const [isDeleting, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteVolunteerHoursAction(id);
      router.refresh();
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Volunteer</TableHead>
          <TableHead>Event</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Hours</TableHead>
          <TableHead className="w-px" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="font-medium">{entry.person?.name ?? "—"}</TableCell>
            <TableCell className="app-muted">{entry.event?.name ?? "—"}</TableCell>
            <TableCell className="app-muted">{entry.volunteer_role_type?.name ?? "—"}</TableCell>
            <TableCell className="app-muted">{dateFormatter.format(new Date(entry.logged_date))}</TableCell>
            <TableCell>{entry.hours}</TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <VolunteerHoursDetailsSheet entry={entry} canManage={canManage} />
                {canManage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove hours entry"
                    disabled={isDeleting}
                    onClick={() => handleDelete(entry.id)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
