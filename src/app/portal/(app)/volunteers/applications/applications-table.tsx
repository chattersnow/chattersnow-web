"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VolunteerApplicationDetailsSheet } from "./application-details-sheet";
import { VolunteerApplicationStatusBadge } from "./application-badges";
import {
  VOLUNTEER_APPLICATION_STATUSES,
  type VolunteerApplication,
  type VolunteerApplicationStatus,
} from "./application-types";

const FILTER_ALL = "all";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

export function ApplicationsTable({
  applications,
  canManage,
  initialStatusFilter = null,
}: {
  applications: VolunteerApplication[];
  canManage: boolean;
  initialStatusFilter?: VolunteerApplicationStatus | null;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<VolunteerApplicationStatus | null>(initialStatusFilter);

  const visibleApplications = useMemo(() => {
    const query = search.trim().toLowerCase();
    return applications.filter((application) => {
      if (statusFilter && application.status !== statusFilter) return false;
      if (
        query &&
        !application.name.toLowerCase().includes(query) &&
        !application.email.toLowerCase().includes(query)
      )
        return false;
      return true;
    });
  }, [applications, search, statusFilter]);

  if (applications.length === 0) {
    return (
      <Card>
        <CardContent className="px-0">
          <p className="app-muted px-4 py-6 text-sm">
            No volunteer applications yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-end gap-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="applications-search"
            className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
          >
            Search
          </label>
          <Input
            id="applications-search"
            placeholder="Search name or email..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 w-full sm:w-64"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
            Status
          </span>
          <Select
            value={statusFilter ?? FILTER_ALL}
            onValueChange={(value) =>
              setStatusFilter(
                value === FILTER_ALL
                  ? null
                  : (value as VolunteerApplicationStatus),
              )
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Status">
                {(value: string) =>
                  value === FILTER_ALL ? "All statuses" : value
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FILTER_ALL}>All statuses</SelectItem>
              {VOLUNTEER_APPLICATION_STATUSES.map((status) => (
                <SelectItem key={status} value={status} className="capitalize">
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role interest</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleApplications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="app-muted text-center">
                    No applications match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                visibleApplications.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell className="font-medium">
                      {application.name}
                    </TableCell>
                    <TableCell className="app-muted">
                      {application.email}
                    </TableCell>
                    <TableCell className="app-muted max-w-sm truncate">
                      {application.role_interest || "—"}
                    </TableCell>
                    <TableCell className="app-muted">
                      {dateFormatter.format(new Date(application.created_at))}
                    </TableCell>
                    <TableCell>
                      <VolunteerApplicationStatusBadge
                        status={application.status}
                      />
                    </TableCell>
                    <TableCell>
                      <VolunteerApplicationDetailsSheet
                        application={application}
                        canManage={canManage}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
