import Link from "next/link";
import { Eye } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/portal/empty-state";
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
import {
  buildHref,
  escapeLikePattern,
  pageRange,
  parsePage,
  quoteOrValue,
  totalPagesFor,
} from "@/lib/pagination";
import { ActiveFilters, type ActiveFilter } from "@/components/active-filters";
import { FiltersSheet } from "@/components/filters-sheet";
import { SearchField } from "@/components/search-field";
import { FilterSubmitButton } from "@/components/filter-submit-button";
import { LinkPendingPulse } from "@/components/link-pending";
import { StatTile } from "../home/stat-tile";
import { NewPersonDialog } from "./new-person-dialog";
import {
  PEOPLE_WITH_ROLES,
  ROLE_OPTIONS,
  rolesFor,
  type PersonRow,
  type RoleKey,
} from "./people-shared";
import type { PeopleSegment } from "./people-segments";

/**
 * Every column the directory table and its row links need. `primary_contact`
 * is a computed relationship on the view rather than the usual column embed:
 * primary_contact_person_id points at people itself, and from the view both
 * directions of that self-reference are visible, which PostgREST rejects as
 * ambiguous (see 20260903030000).
 */
const PERSON_COLUMNS =
  "id, name, email, phone, instagram_handle, notes, logo_url, website, auth_user_id, is_donor, is_sponsor, is_volunteer, is_attendee, is_staff, is_partner, person_type, riding_discipline, ski_experience_level, snowboard_experience_level, preferred_mountain, primary_contact_person_id, primary_contact(id, name, email, phone)";

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function isRoleKey(value: string | undefined): value is RoleKey {
  return !!value && ROLE_OPTIONS.some((option) => option.key === value);
}

/**
 * The shared body behind /portal/people and its role segments. Donors,
 * Sponsors, and Attendees were near-identical copies of this file; everything
 * that genuinely differs between them lives in the PeopleSegment config.
 */
export async function PeopleDirectory({
  segment,
  searchParams,
}: {
  segment: PeopleSegment;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "people", "manage");

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const search = raw("search") || "";
  const roleRaw = raw("role");
  // Only the full directory offers the facet; a segment is already one, so a
  // stray ?role= on /portal/donors is ignored rather than silently narrowing.
  const roleFilter: RoleKey | "all" =
    segment.showRoleFilter && isRoleKey(roleRaw) ? roleRaw : "all";
  const page = parsePage(raw("page"));

  let query = supabase
    .from(PEOPLE_WITH_ROLES)
    .select(PERSON_COLUMNS, { count: "exact" })
    .order("name", { ascending: true })
    .order("id", { ascending: true });

  if (segment.filterColumn) query = query.eq(segment.filterColumn, true);
  if (segment.personType) query = query.eq("person_type", segment.personType);
  if (roleFilter !== "all") query = query.eq(roleFilter, true);
  if (search) {
    const pattern = quoteOrValue(`%${escapeLikePattern(search)}%`);
    query = query.or(
      `name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`,
    );
  }

  const { offset, to } = pageRange(page);
  const [{ data: people, count }, { data: peopleOptions }, stats] =
    await Promise.all([
      query.range(offset, to),
      supabase
        .from("people")
        .select(
          "id, name, preferred_name, email, phone, person_type, auth_user_id",
        )
        .order("name", { ascending: true }),
      segment.stats ? segment.stats(supabase) : Promise.resolve(null),
    ]);
  const peopleRows = (people ?? []) as unknown as PersonRow[];

  const filterParams = new URLSearchParams();
  if (search) filterParams.set("search", search);
  if (roleFilter !== "all") filterParams.set("role", roleFilter);

  const totalPages = totalPagesFor(count);
  const hasActiveFilters = !!search || roleFilter !== "all";
  const activeFilterCount = [roleFilter !== "all"].filter(Boolean).length;
  const appliedFilters: ActiveFilter[] = [];
  if (search) {
    appliedFilters.push({ param: "search", label: "Search", value: search });
  }
  if (roleFilter !== "all") {
    appliedFilters.push({
      param: "role",
      label: "Role",
      value:
        ROLE_OPTIONS.find((option) => option.key === roleFilter)?.label ??
        roleFilter,
    });
  }

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          {segment.title}
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      {stats && stats.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {stats.map((stat) => (
            <StatTile
              key={stat.label}
              label={stat.label}
              value={stat.value}
              caption={stat.caption}
            />
          ))}
        </div>
      )}

      <div className="mt-6 space-y-4">
        <div
          className={`rainbow-surface flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md ${
            segment.showRoleFilter ? "justify-end" : "justify-between"
          }`}
        >
          <SearchField
            action={segment.basePath}
            defaultValue={search}
            placeholder="Search name, email, phone..."
            preserve={segment.showRoleFilter ? { role: roleFilter } : undefined}
          />

          {segment.showRoleFilter && (
            <FiltersSheet activeCount={activeFilterCount}>
              <form method="get" className="flex flex-col gap-4">
                {/* Search lives in the toolbar now; carry it through so
                    applying a filter here doesn't drop the current query. */}
                <input type="hidden" name="search" value={search} />

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="role"
                    className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
                  >
                    Role
                  </label>
                  <select
                    id="role"
                    name="role"
                    defaultValue={roleFilter}
                    className={selectClassName}
                  >
                    <option value="all">All people</option>
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
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
                      render={<Link href={segment.basePath} />}
                    >
                      <LinkPendingPulse>Clear</LinkPendingPulse>
                    </Button>
                  )}
                </div>
              </form>
            </FiltersSheet>
          )}

          {/* Only on the full directory: the role segments (Donors, Sponsors,
              ...) are filtered views, and a duplicate pair can straddle two of
              them, so the queue belongs on the one page that lists everybody. */}
          {canManage && segment.showRoleFilter && (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/portal/people/duplicates" />}
            >
              Find duplicates
            </Button>
          )}

          {canManage && segment.newPerson && (
            <NewPersonDialog
              people={peopleOptions ?? []}
              defaultRole={segment.newPerson.defaultRole}
              defaultPersonType={segment.newPerson.defaultPersonType}
              triggerLabel={segment.newPerson.triggerLabel}
            />
          )}
        </div>

        {segment.showRoleFilter && (
          <ActiveFilters
            action={segment.basePath}
            filters={appliedFilters}
            params={{ search, role: roleFilter }}
          />
        )}

        <Card>
          <CardContent className="px-0">
            {peopleRows.length === 0 ? (
              <EmptyState
                title={
                  hasActiveFilters
                    ? `No ${segment.noun}s match your filters`
                    : segment.emptyTitle
                }
                description={
                  hasActiveFilters
                    ? "Clear or loosen the filters to see more."
                    : canManage
                      ? segment.emptyDescriptionManage
                      : segment.emptyDescriptionView
                }
              />
            ) : (
              <Table stickyFirstColumn>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead hideBelow="md">Email</TableHead>
                    <TableHead hideBelow="lg">Phone</TableHead>
                    <TableHead className="w-0">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {peopleRows.map((person) => (
                    <TableRow key={person.id}>
                      <TableCell
                        className="max-w-xs truncate font-medium"
                        title={person.name ?? undefined}
                      >
                        <Link
                          href={`/portal/people/${person.id}`}
                          className="hover:underline"
                        >
                          {person.name ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="app-muted">
                        {rolesFor(person).join(", ") || "—"}
                      </TableCell>
                      <TableCell hideBelow="md" className="app-muted">
                        {person.email ?? "—"}
                      </TableCell>
                      <TableCell hideBelow="lg" className="app-muted">
                        {person.phone ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          nativeButton={false}
                          aria-label={`View ${person.name ?? segment.noun}`}
                          render={<Link href={`/portal/people/${person.id}`} />}
                        >
                          <LinkPendingPulse>
                            <Eye />
                          </LinkPendingPulse>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {peopleRows.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            count={count}
            hrefFor={(nextPage) =>
              buildHref(segment.basePath, filterParams, { page: nextPage })
            }
          />
        )}
      </div>
    </>
  );
}
