"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  deleteVolunteerHoursAction,
  type VolunteerHoursEntry,
} from "./actions";
import { VolunteerHoursDetailsSheet } from "./volunteer-hours-details-sheet";
import { ConfirmDeleteButton } from "@/components/portal/confirm-delete-button";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";
import { formatCalendarDate, personDisplayName } from "@/lib/format";
import { useActionToast } from "@/components/portal/action-toast";

export function HoursTable({
  entries,
  canManage,
}: {
  entries: VolunteerHoursEntry[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { isPending: isDeleting, run } = useActionToast();

  // Stable, so the column list below only rebuilds when something it
  // actually renders differently changes.
  const handleDelete = useCallback(
    (id: string) => {
      run(() => deleteVolunteerHoursAction(id), {
        success: "Hours entry deleted.",
        error: "Could not delete the hours entry. Please try again.",
        onSuccess: () => router.refresh(),
      });
    },
    [run, router],
  );

  const columns = useMemo<PortalDataTableColumn<VolunteerHoursEntry>[]>(
    () => [
      {
        key: "person",
        label: "Volunteer",
        // Sorts on the name the cell shows, placeholder included, rather than
        // on a null the reader never sees.
        sortValue: (entry) => personDisplayName(entry.person),
        cellClassName: "max-w-xs font-medium",
        render: (entry) => (
          <span
            className="block truncate"
            title={entry.person?.name ?? undefined}
          >
            {personDisplayName(entry.person)}
          </span>
        ),
      },
      {
        key: "event",
        label: "Event",
        sortValue: (entry) => entry.event?.name,
        hideBelow: "md",
        cellClassName: "max-w-xs app-muted",
        render: (entry) => (
          <span
            className="block truncate"
            title={entry.event?.name ?? undefined}
          >
            {entry.event?.name ?? "—"}
          </span>
        ),
      },
      {
        key: "role",
        label: "Role",
        sortValue: (entry) => entry.volunteer_role_type?.name,
        hideBelow: "lg",
        cellClassName: "app-muted",
        render: (entry) => entry.volunteer_role_type?.name ?? "—",
      },
      {
        key: "logged_date",
        label: "Date",
        sortValue: (entry) => entry.logged_date,
        hideBelow: "sm",
        cellClassName: "app-muted",
        render: (entry) => formatCalendarDate(entry.logged_date),
      },
      {
        key: "hours",
        label: "Hours",
        // Numeric, because hours arrive from Postgres as a string and would
        // otherwise sort "10" before "9".
        sortValue: (entry) => Number(entry.hours),
        render: (entry) => entry.hours,
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (entry) => (
          <div className="flex items-center justify-end gap-1">
            <VolunteerHoursDetailsSheet entry={entry} canManage={canManage} />
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
        ),
      },
    ],
    [canManage, isDeleting, handleDelete],
  );

  return (
    <PortalDataTable
      columns={columns}
      rows={entries}
      getRowKey={(entry) => entry.id}
      // listVolunteerHoursAction returns newest first.
      defaultSort={{ key: "logged_date", dir: "desc" }}
      emptyMessage="No hours to show."
      // The page already wraps this in a card, under its running total.
      shell="bare"
      stickyFirstColumn
    />
  );
}
