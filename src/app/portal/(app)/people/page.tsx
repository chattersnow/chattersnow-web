import type { Metadata } from "next";
import Link from "next/link";
import { Eye } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { FiltersSheet } from "@/components/filters-sheet";
import { FilterSubmitButton } from "@/components/filter-submit-button";
import { LinkPendingPulse } from "@/components/link-pending";
import { NewPersonDialog } from "./new-person-dialog";
import {
  ROLE_OPTIONS,
  rolesFor,
  type PersonRow,
  type RoleKey,
} from "./people-shared";

type PeoplePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function isRoleKey(value: string | undefined): value is RoleKey {
  return !!value && ROLE_OPTIONS.some((option) => option.key === value);
}

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export const metadata: Metadata = {
  title: "People",
};

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
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
  const roleFilter: RoleKey | "all" = isRoleKey(roleRaw) ? roleRaw : "all";

  const page = parsePage(raw("page"));

  let query = supabase
    .from("people")
    .select(
      "id, name, email, phone, instagram_handle, notes, logo_url, website, is_donor, is_sponsor, is_volunteer, is_organization, is_attendee, primary_contact_person_id, primary_contact:primary_contact_person_id(id, name, email, phone)",
      { count: "exact" },
    )
    .order("name", { ascending: true })
    .order("id", { ascending: true });

  if (search) {
    const pattern = quoteOrValue(`%${escapeLikePattern(search)}%`);
    query = query.or(
      `name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`,
    );
  }
  if (roleFilter !== "all") {
    query = query.eq(roleFilter, true);
  }

  const { offset, to } = pageRange(page);
  const [{ data: people, count }, { data: peopleOptions }] = await Promise.all([
    query.range(offset, to),
    supabase
      .from("people")
      .select("id, name, email, phone, is_sponsor")
      .order("name", { ascending: true }),
  ]);
  const peopleRows = (people ?? []) as unknown as PersonRow[];

  const filterParams = new URLSearchParams();
  if (search) filterParams.set("search", search);
  if (roleFilter !== "all") filterParams.set("role", roleFilter);

  function pageHref(nextPage: number) {
    return buildHref("/portal/people", filterParams, { page: nextPage });
  }

  const totalPages = totalPagesFor(count);
  const hasActiveFilters = !!search || roleFilter !== "all";
  const activeFilterCount = [!!search, roleFilter !== "all"].filter(
    Boolean,
  ).length;

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          People
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6 space-y-4">
        <div className="rainbow-surface flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
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
                  placeholder="Search name, email, phone..."
                  defaultValue={search}
                />
              </div>

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
                    render={<Link href="/portal/people" />}
                  >
                    <LinkPendingPulse>Clear</LinkPendingPulse>
                  </Button>
                )}
              </div>
            </form>
          </FiltersSheet>

          {canManage && <NewPersonDialog people={peopleOptions ?? []} />}
        </div>

        <Card>
          <CardContent className="px-0">
            {peopleRows.length === 0 ? (
              <p className="app-muted px-4 py-6 text-sm">
                {hasActiveFilters
                  ? "No people match your filters."
                  : "No people added yet."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
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
                      <TableCell className="app-muted">
                        {person.email ?? "—"}
                      </TableCell>
                      <TableCell className="app-muted">
                        {person.phone ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          nativeButton={false}
                          aria-label={`View ${person.name ?? "person"}`}
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
          <Pagination page={page} totalPages={totalPages} hrefFor={pageHref} />
        )}
      </div>
    </>
  );
}
