"use client";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditBylawsModal } from "./edit-bylaws-modal";
import { NewBylawsDialog } from "./new-bylaws-dialog";
import type { Bylaws } from "./bylaws-actions";
import { formatCalendarDate } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

export function BylawsTable({
  bylaws,
  canManage,
}: {
  bylaws: Bylaws[];
  canManage: boolean;
}) {
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
            <p className="app-muted px-4 py-6 text-sm">
              No bylaws recorded yet.
            </p>
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
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Effective date</TableHead>
                  <TableHead>What changed</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="app-muted text-center">
                      No earlier versions on file.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">
                        {entry.version}
                      </TableCell>
                      <TableCell className="app-muted">
                        {formatCalendarDate(entry.effective_date)}
                      </TableCell>
                      <TableCell
                        className="app-muted max-w-xs truncate"
                        title={entry.amendment_summary ?? undefined}
                      >
                        {entry.amendment_summary || "—"}
                      </TableCell>
                      <TableCell>
                        {canManage && <EditBylawsModal bylaws={entry} />}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
