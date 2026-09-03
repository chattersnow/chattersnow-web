import { Card, CardContent } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortHeaderLink } from "@/components/portal/sort-header-link";
import { ActionBadge, TABLE_LABELS } from "./audit-log-badges";
import {
  AuditLogDetailSheet,
  type AuditLogRow,
} from "./audit-log-detail-sheet";
import type { AuditLogEntry } from "./audit-log-query";
import type { SortColumn } from "./audit-log-params";
import { formatDateTime } from "@/lib/format";

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "occurred_at", label: "Occurred at" },
  { key: "table_name", label: "Table" },
  { key: "action", label: "Action" },
];

export function AuditLogTable({
  entries,
  error,
  sort,
  dir,
  sortHref,
  actorEmailById,
  page,
  totalPages,
  count,
  pageHref,
}: {
  entries: AuditLogEntry[] | null;
  error: unknown;
  sort: SortColumn;
  dir: "asc" | "desc";
  sortHref: (column: SortColumn) => string;
  actorEmailById: Map<string, string>;
  page: number;
  totalPages: number;
  count: number | null;
  pageHref: (nextPage: number) => string;
}) {
  return (
    <>
      <Card className="mt-6">
        <CardContent className="px-0">
          {error ? (
            <p className="app-muted px-4 py-6 text-sm">
              Could not load the audit log. Please try again.
            </p>
          ) : !entries || entries.length === 0 ? (
            <p className="app-muted px-4 py-6 text-sm">
              No entries match these filters.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((column) => (
                    <TableHead
                      key={column.key}
                      sortDirection={sort === column.key ? dir : null}
                    >
                      <SortHeaderLink
                        href={sortHref(column.key)}
                        label={column.label}
                        dir={sort === column.key ? dir : null}
                      />
                    </TableHead>
                  ))}
                  <TableHead>Record</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const auditRow: AuditLogRow = {
                    id: entry.id,
                    table_name: entry.table_name,
                    record_id: entry.record_id,
                    action: entry.action,
                    occurred_at: entry.occurred_at,
                    actor_label: entry.actor_id
                      ? (actorEmailById.get(entry.actor_id) ?? entry.actor_id)
                      : "System",
                    old_data: entry.old_data,
                    new_data: entry.new_data,
                  };
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>{formatDateTime(entry.occurred_at)}</TableCell>
                      <TableCell>
                        {TABLE_LABELS[entry.table_name] ?? entry.table_name}
                      </TableCell>
                      <TableCell>
                        <ActionBadge action={entry.action} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.record_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="app-muted">
                        {auditRow.actor_label}
                      </TableCell>
                      <TableCell className="text-right">
                        <AuditLogDetailSheet row={auditRow} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {entries && entries.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          count={count}
          hrefFor={pageHref}
        />
      )}
    </>
  );
}
