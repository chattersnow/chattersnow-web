"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/portal/empty-state";
import type { RetentionRunRow, RetentionRunTableRow } from "./retention-query";

const ACTION_LABEL: Record<string, string> = {
  deleted: "deleted",
  anonymized: "anonymized",
  cleared: "cleared",
  backfilled: "backfilled",
  skipped: "skipped",
};

function formatWhen(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * The run history. Every row says whether it was a preview, because that is the
 * difference between "we removed 412 records" and "we would have": reading this
 * table wrong in either direction is the thing to design against.
 */
export function RetentionRunsTable({
  runs,
  countsByRun,
  actorEmailById,
}: {
  runs: RetentionRunRow[];
  countsByRun: Map<string, RetentionRunTableRow[]>;
  actorEmailById: Map<string, string>;
}) {
  if (runs.length === 0) {
    return (
      <EmptyState
        title="No retention runs yet"
        description="The nightly job records every run here, including previews that changed nothing."
      />
    );
  }

  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Run</TableHead>
              <TableHead>Started by</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>What it touched</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => {
              const counts = (countsByRun.get(run.id) ?? []).filter(
                (row) => row.row_count > 0 || row.error,
              );

              return (
                <TableRow key={run.id}>
                  <TableCell className="align-top">
                    <div className="font-medium">
                      {formatWhen(run.started_at)}
                    </div>
                    <div className="app-muted mt-1 flex flex-wrap gap-2 text-xs">
                      <Badge variant={run.dry_run ? "secondary" : "default"}>
                        {run.dry_run ? "Preview" : "Enforced"}
                      </Badge>
                      <span>{run.trigger}</span>
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {/* Null under cron: there is no request and no JWT inside a
                        pg_cron job, so auth.uid() is null by construction. */}
                    {run.triggered_by
                      ? (actorEmailById.get(run.triggered_by) ??
                        run.triggered_by)
                      : "Scheduled"}
                    {run.reason ? (
                      <p className="app-muted mt-1 text-xs">{run.reason}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {run.status}
                    {run.error ? (
                      <p className="app-muted mt-1 text-xs">{run.error}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {counts.length === 0 ? (
                      <span className="app-muted">Nothing was due.</span>
                    ) : (
                      <ul className="space-y-1">
                        {counts.map((row) => (
                          <li key={row.id}>
                            {row.error ? (
                              <span className="app-muted">
                                {row.table_name}: {row.error}
                              </span>
                            ) : (
                              <>
                                {row.row_count.toLocaleString()}{" "}
                                {row.table_name.replace(/_/g, " ")}{" "}
                                {ACTION_LABEL[row.action] ?? row.action}
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
