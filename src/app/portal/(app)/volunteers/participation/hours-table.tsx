"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteVolunteerHoursAction, type VolunteerHoursEntry } from "./actions";
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
          {canManage && <TableHead className="w-px" />}
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
            {canManage && (
              <TableCell className="text-right">
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
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
