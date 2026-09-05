"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EditBylawsModal } from "./edit-bylaws-modal";
import { NewBylawsDialog } from "./new-bylaws-dialog";
import type { Bylaws } from "./bylaws-actions";
import { formatCalendarDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";
import {
  PortalDataTable,
  type PortalDataTableColumn,
} from "@/components/portal/data-table";

export function BylawsTable({
  bylaws,
  canManage,
}: {
  bylaws: Bylaws[];
  canManage: boolean;
}) {
  // Above the empty-list return below, where a hook could not go.
  const columns = useMemo<PortalDataTableColumn<Bylaws>[]>(
    () => [
      {
        key: "version",
        label: "Version",
        sortValue: (entry) => entry.version,
        cellClassName: "font-medium",
        render: (entry) => entry.version,
      },
      {
        key: "effective_date",
        label: "Effective date",
        sortValue: (entry) => entry.effective_date,
        cellClassName: "app-muted",
        render: (entry) => formatCalendarDate(entry.effective_date),
      },
      {
        key: "amendment_summary",
        // Free prose, truncated: nothing a reader would look for in its
        // alphabetical order, so it stays unsorted.
        label: "What changed",
        cellClassName: "app-muted max-w-xs truncate",
        render: (entry) => (
          <span title={entry.amendment_summary ?? undefined}>
            {entry.amendment_summary || "—"}
          </span>
        ),
      },
      {
        key: "actions",
        label: "Actions",
        srOnlyLabel: true,
        headClassName: "w-0",
        render: (entry) =>
          canManage ? <EditBylawsModal bylaws={entry} /> : null,
      },
    ],
    [canManage],
  );

  if (bylaws.length === 0) {
    return (
      <div className="space-y-4">
        {canManage && (
          <div className="rainbow-surface flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
            <NewBylawsDialog />
          </div>
        )}
        <Card>
          <CardContent className="px-0">
            <EmptyState
              title="No bylaws recorded yet"
              description={
                canManage
                  ? "Add the first one with Add bylaws version above."
                  : "Bylaws appear here once a governance manager adds them."
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const [current, ...history] = bylaws;

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="rainbow-surface flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <NewBylawsDialog />
        </div>
      )}

      <Card>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              Current
            </span>
            <span className="font-medium">{current.version}</span>
          </div>
          <p className="app-muted text-sm">
            Effective {formatCalendarDate(current.effective_date)}
          </p>
          {current.external_link && (
            <a
              href={current.external_link}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-[var(--purple-deep)] underline"
            >
              {current.external_link}
            </a>
          )}
          {canManage && (
            <div>
              <EditBylawsModal bylaws={current} />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
          Amendment history
        </h2>
        <PortalDataTable
          columns={columns}
          rows={history}
          getRowKey={(entry) => entry.id}
          // The query orders by effective date, newest first; the arrow starts
          // on the column the history is already reading in.
          defaultSort={{ key: "effective_date", dir: "desc" }}
          emptyMessage="No earlier versions on file."
        />
      </div>
    </div>
  );
}
