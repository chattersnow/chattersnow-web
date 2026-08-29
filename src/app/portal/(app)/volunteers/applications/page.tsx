import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FiltersSheet } from "@/components/filters-sheet";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
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
  pageRange,
  parsePage,
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

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

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

  const page = parsePage(raw("page"));

  let query = supabase
    .from("volunteer_applications")
    .select(
      "id, name, email, phone, role_interest, availability, status, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  if (search) {
    const pattern = quoteOrValue(`%${escapeLikePattern(search)}%`);
    query = query.or(`name.ilike.${pattern},email.ilike.${pattern}`);
  }
  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { offset, to } = pageRange(page);
  const { data: applications, error, count } = await query.range(offset, to);
  const applicationRows = (applications ?? []) as VolunteerApplication[];

  const filterParams = new URLSearchParams();
  if (search) filterParams.set("search", search);
  if (statusFilter !== "all") filterParams.set("status", statusFilter);

  function pageHref(nextPage: number) {
    return buildHref("/portal/volunteers/applications", filterParams, {
      page: nextPage,
    });
  }

  const totalPages = totalPagesFor(count);
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
                    <Button type="submit" variant="secondary">
                      Filter
                    </Button>
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        nativeButton={false}
                        render={<Link href="/portal/volunteers/applications" />}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </form>
              </FiltersSheet>
            </div>

            <Card>
              <CardContent className="px-0">
                {applicationRows.length === 0 ? (
                  <p className="app-muted px-4 py-6 text-sm">
                    {hasActiveFilters
                      ? "No applications match your filters."
                      : "No volunteer applications yet."}
                  </p>
                ) : (
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
                            {dateFormatter.format(
                              new Date(application.created_at),
                            )}
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
                hrefFor={pageHref}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
