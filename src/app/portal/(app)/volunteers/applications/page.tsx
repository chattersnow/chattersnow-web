import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
import { getTenantContext } from "@/lib/portal/tenants";
import {
  NO_RECORD_MESSAGES,
  VOLUNTEER_APPLICATION_RECORD_TYPE,
} from "@/lib/outbound-messages";
import { loadRecordMessages } from "@/lib/portal/record-messages";
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
  type HideBelow,
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
  APPLICATION_PARAM,
  VOLUNTEER_APPLICATION_STATUSES,
  type VolunteerApplication,
  type VolunteerApplicationStatus,
} from "./application-types";

import { ViewerTime } from "@/components/viewer-time";

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

const COLUMNS: { key: SortColumn; label: string; hideBelow?: HideBelow }[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email", hideBelow: "md" },
  { key: "role_interest", label: "Role interest", hideBelow: "lg" },
  { key: "created_at", label: "Submitted", hideBelow: "sm" },
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
      "id, name, email, phone, pronouns, role_interest, availability, status, created_at",
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

  // A notification email (#742) links straight at one application. The list is
  // filtered, sorted and paginated, so there is no guarantee that row is on
  // the page the link happens to land on -- and it will not be, for anything
  // but the newest few. Fetch it on its own when it is missing and render a
  // triggerless sheet for it, so the link opens what it says it opens. RLS
  // still decides whether the row comes back at all.
  const linkedApplicationId = raw(APPLICATION_PARAM);
  let linkedApplication: VolunteerApplication | null = null;
  if (
    linkedApplicationId &&
    !applicationRows.some((row) => row.id === linkedApplicationId)
  ) {
    // Errors are ignored on purpose, including the 22P02 a hand-mangled id
    // produces: a link that no longer resolves should leave the reader on the
    // ordinary list, not on an error page.
    const { data: linked } = await supabase
      .from("volunteer_applications")
      .select(
        "id, name, email, phone, pronouns, role_interest, availability, status, created_at",
      )
      .eq("id", linkedApplicationId)
      .maybeSingle();
    linkedApplication = (linked as VolunteerApplication | null) ?? null;
  }

  // What has been said to each applicant on this page, in one query rather
  // than one per sheet: the list renders a sheet per row, and a reviewer opens
  // one of them. RLS answers with nothing without volunteers:manage, so the
  // check here only saves the round trips for a reader who cannot see it.
  const applicationIds = [
    ...applicationRows.map((row) => row.id),
    ...(linkedApplication ? [linkedApplication.id] : []),
  ];
  const [recordMessages, orgEmailEnabled, tenantContext] = await Promise.all([
    canManage
      ? loadRecordMessages(
          supabase,
          VOLUNTEER_APPLICATION_RECORD_TYPE,
          applicationIds,
        )
      : NO_RECORD_MESSAGES,
    canManage ? getOrgEmailEnabled(supabase) : false,
    // Only for what the composer calls the organization in its default
    // subject. Memoized per request, so the shell has already paid for it.
    getTenantContext(supabase),
  ]);
  const orgName =
    tenantContext.tenants.find(
      (tenant) => tenant.id === tenantContext.currentTenantId,
    )?.name ?? "";
  // The Reply-To the composer quotes, through the view that exists because
  // app_settings itself is closed to a volunteers manager.
  const { data: orgMail } = canManage
    ? await supabase
        .from("org_notification_settings")
        .select("reply_to")
        .maybeSingle()
    : { data: null };
  const replyTo = (orgMail?.reply_to as string | null) ?? null;

  const messageProps = (applicationId: string) => ({
    messages: recordMessages.byRecord[applicationId] ?? [],
    messageActors: recordMessages.actors,
    orgName,
    replyTo,
    orgEmailEnabled,
  });

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
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
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
                            hideBelow={column.hideBelow}
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
                          <TableCell hideBelow="md" className="app-muted">
                            {application.email}
                          </TableCell>
                          <TableCell
                            hideBelow="lg"
                            className="app-muted max-w-sm truncate"
                          >
                            {application.role_interest || "—"}
                          </TableCell>
                          <TableCell hideBelow="sm" className="app-muted">
                            <ViewerTime
                              iso={application.created_at}
                              fallbackZone="UTC"
                              options={{ dateStyle: "medium" }}
                            />
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
                              {...messageProps(application.id)}
                              defaultOpen={
                                application.id === linkedApplicationId
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {linkedApplication ? (
              <VolunteerApplicationDetailsSheet
                application={linkedApplication}
                canManage={canManage}
                {...messageProps(linkedApplication.id)}
                defaultOpen
                withTrigger={false}
              />
            ) : null}

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
