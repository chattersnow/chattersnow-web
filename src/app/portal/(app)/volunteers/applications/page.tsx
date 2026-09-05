import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/portal/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { FiltersSheet } from "@/components/filters-sheet";
import { FilterSubmitButton } from "@/components/filter-submit-button";
import { LinkPendingPulse } from "@/components/link-pending";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { SortHeaderLink } from "@/components/portal/sort-header-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildHref,
  escapeLikePattern,
  PAGE_SIZE,
  pageRange,
  parsePage,
  parsePerPage,
  quoteOrValue,
  totalPagesFor,
} from "@/lib/pagination";
import { VolunteerApplicationDetailsSheet } from "./application-details-sheet";
import { VolunteerApplicationStatusBadge } from "./application-badges";
import {
  VOLUNTEER_APPLICATION_STATUSES,
  type VolunteerApplication,
  type VolunteerApplicationStatus,
} from "./application-types";
import { formatInstantDate } from "@/lib/format";

type ApplicationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function isVolunteerApplicationStatus(
  value: string | undefined,
): value is VolunteerApplicationStatus {
  return (
    !!value &&
    (VOLUNTEER_APPLICATION_STATUSES as readonly string[]).includes(value)
  );
}

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export const metadata: Metadata = {
  title: "Volunteer Applications",
};

const SORTABLE_COLUMNS = [
  "name",
  "email",
  "role_interest",
  "created_at",
  "status",
] as const;
type SortColumn = (typeof SORTABLE_COLUMNS)[number];

function isSortColumn(value: string | undefined): value is SortColumn {
  return !!value && (SORTABLE_COLUMNS as readonly string[]).includes(value);
}

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "role_interest", label: "Role interest" },
  { key: "created_at", label: "Submitted" },
  // Sorts alphabetically rather than by where a status sits in the workflow,
  // which is what the column holds. Grouping like with like is the point.
  { key: "status", label: "Status" },
];

export default async function VolunteerApplicationsPage({
  searchParams,
}: ApplicationsPageProps) {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "volunteers", "manage");

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const search = raw("search") || "";
  const statusRaw = raw("status");
  const statusFilter: VolunteerApplicationStatus | "all" =
    isVolunteerApplicationStatus(statusRaw) ? statusRaw : "all";

  const sortParam = raw("sort");
  const sort: SortColumn = isSortColumn(sortParam) ? sortParam : "created_at";
  const dir: "asc" | "desc" = raw("dir") === "asc" ? "asc" : "desc";

  const page = parsePage(raw("page"));
  const perPage = parsePerPage(raw("perPage"));

  let query = supabase
    .from("volunteer_applications")
    .select(
      "id, name, email, phone, role_interest, availability, status, created_at",
      { count: "exact" },
    )
    .order(sort, { ascending: dir === "asc" })
    .order("id", { ascending: true });

  if (search) {
    const pattern = quoteOrValue(`%${escapeLikePattern(search)}%`);
    query = query.or(`name.ilike.${pattern},email.ilike.${pattern}`);
  }
  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { offset, to } = pageRange(page, perPage);
  const { data: applications, error, count } = await query.range(offset, to);
  const applicationRows = (applications ?? []) as VolunteerApplication[];

  const filterParams = new URLSearchParams();
  if (search) filterParams.set("search", search);
  if (statusFilter !== "all") filterParams.set("status", statusFilter);
  // On filterParams rather than in each href, so sorting and paging both
  // carry the reader's choice without either having to remember to.
  if (perPage !== PAGE_SIZE) filterParams.set("perPage", String(perPage));

  function sortHref(column: SortColumn) {
    const nextDir = sort === column && dir === "asc" ? "desc" : "asc";
    return buildHref("/portal/volunteers/applications", filterParams, {
      sort: column,
      dir: nextDir,
    });
  }

  function pageHref(nextPage: number) {
    return buildHref("/portal/volunteers/applications", filterParams, {
      sort,
      dir,
      page: nextPage,
    });
  }

  function perPageHref(nextPerPage: number) {
    // Back to page one: a bigger page renumbers them all, and page 4 of 9 is
    // nothing in particular once each page holds 25.
    return buildHref("/portal/volunteers/applications", filterParams, {
      sort,
      dir,
      perPage: nextPerPage,
      page: 1,
    });
  }

  const totalPages = totalPagesFor(count, perPage);
  const hasActiveFilters = !!search || statusFilter !== "all";
  const activeFilterCount = [!!search, statusFilter !== "all"].filter(
    Boolean,
  ).length;

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Applications
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Volunteer interest submissions from the public site, ready to follow up
        on.
      </p>

      <div className="mt-6 space-y-4">
        {error ? (
          <p className="app-muted px-4 py-6 text-sm">
            Could not load volunteer applications. Please try again.
          </p>
        ) : (
          <>
            <div className="rainbow-surface flex justify-end rounded-xl border border-[var(--line)] p-4 shadow-md">
              <FiltersSheet activeCount={activeFilterCount}>
                <form method="get" className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="search"
                      className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
                    >
                      Search
                    </label>
                    <Input
                      id="search"
                      name="search"
                      placeholder="Search name or email..."
                      defaultValue={search}
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="status"
                      className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
                    >
                      Status
                    </label>
                    <select
                      id="status"
                      name="status"
                      defaultValue={statusFilter}
                      className={selectClassName}
                    >
                      <option value="all">All statuses</option>
                      {VOLUNTEER_APPLICATION_STATUSES.map((status) => (
                        <option
                          key={status}
                          value={status}
                          className="capitalize"
                        >
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <FilterSubmitButton />
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        nativeButton={false}
                        render={<Link href="/portal/volunteers/applications" />}
                      >
                        <LinkPendingPulse>Clear</LinkPendingPulse>
                      </Button>
                    )}
                  </div>
                </form>
              </FiltersSheet>
            </div>

            <Card>
              <CardContent className="px-0">
                {applicationRows.length === 0 ? (
                  <EmptyState
                    title={
                      hasActiveFilters
                        ? "No applications match your filters"
                        : "No volunteer applications yet"
                    }
                    description={
                      hasActiveFilters
                        ? "Clear or loosen the filters to see more."
                        : "Applications appear here once someone submits the volunteer form on the public Get Involved page."
                    }
                  />
                ) : (
                  <Table stickyHeader="page">
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
                        <TableHead className="w-0">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {applicationRows.map((application) => (
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
                            {formatInstantDate(application.created_at)}
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
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {applicationRows.length > 0 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                count={count}
                pageSize={perPage}
                hrefFor={pageHref}
                perPageHrefFor={perPageHref}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
