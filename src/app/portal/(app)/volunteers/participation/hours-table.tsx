"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteVolunteerHoursAction,
  type VolunteerHoursEntry,
} from "./actions";
import { VolunteerHoursDetailsSheet } from "./volunteer-hours-details-sheet";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { personDisplayName } from "@/lib/format";

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function HoursTable({
  entries,
  canManage,
}: {
  entries: VolunteerHoursEntry[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isDeleting, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteVolunteerHoursAction(id);
      router.refresh();
    });
  }

  return (
    <Table stickyFirstColumn>
      <TableHeader>
        <TableRow>
          <TableHead>Volunteer</TableHead>
          <TableHead hideBelow="md">Event</TableHead>
          <TableHead hideBelow="lg">Role</TableHead>
          <TableHead hideBelow="sm">Date</TableHead>
          <TableHead>Hours</TableHead>
          <TableHead className="w-px" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell
              className="max-w-xs truncate font-medium"
              title={entry.person?.name ?? undefined}
            >
              {personDisplayName(entry.person)}
            </TableCell>
            <TableCell
              hideBelow="md"
              className="max-w-xs truncate app-muted"
              title={entry.event?.name ?? undefined}
            >
              {entry.event?.name ?? "—"}
            </TableCell>
            <TableCell hideBelow="lg" className="app-muted">
              {entry.volunteer_role_type?.name ?? "—"}
            </TableCell>
            <TableCell hideBelow="sm" className="app-muted">
              {dateFormatter.format(new Date(entry.logged_date))}
            </TableCell>
            <TableCell>{entry.hours}</TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <VolunteerHoursDetailsSheet
                  entry={entry}
                  canManage={canManage}
                />
                {canManage && (
                  <ConfirmDeleteButton
                    label="Remove hours entry"
                    title={`Remove ${personDisplayName(entry.person)}'s logged hours?`}
                    description="Volunteer hours feed grant reporting, so removing this changes reported totals. It can't be undone."
                    confirmLabel="Remove"
                    pending={isDeleting}
                    onConfirm={() => handleDelete(entry.id)}
                  />
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
