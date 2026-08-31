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
import { NewPersonDialog } from "../people/new-person-dialog";
import { rolesFor, type PersonRow } from "../people/people-shared";

type DonorsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Donors",
};

export default async function DonorsPage({ searchParams }: DonorsPageProps) {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "people", "manage");

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const search = raw("search") || "";
  const page = parsePage(raw("page"));

  let query = supabase
    .from("people")
    .select(
      "id, name, email, phone, instagram_handle, notes, logo_url, website, is_donor, is_sponsor, is_volunteer, is_organization, primary_contact_person_id, primary_contact:primary_contact_person_id(id, name, email, phone)",
      { count: "exact" },
    )
    .eq("is_donor", true)
    .order("name", { ascending: true })
    .order("id", { ascending: true });

  if (search) {
    const pattern = quoteOrValue(`%${escapeLikePattern(search)}%`);
    query = query.or(
      `name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`,
    );
  }

  const { offset, to } = pageRange(page);
  const [{ data: people, count }, { data: peopleOptions }] = await Promise.all([
    query.range(offset, to),
    supabase
      .from("people")
      .select("id, name, email, phone, is_sponsor, is_organization")
      .order("name", { ascending: true }),
  ]);
  const peopleRows = (people ?? []) as unknown as PersonRow[];

  const filterParams = new URLSearchParams();
  if (search) filterParams.set("search", search);

  function pageHref(nextPage: number) {
    return buildHref("/portal/donors", filterParams, { page: nextPage });
  }

  const totalPages = totalPagesFor(count);
  const hasActiveFilters = !!search;

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Donors
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6 space-y-4">
        <div className="rainbow-surface flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <FiltersSheet activeCount={hasActiveFilters ? 1 : 0}>
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

              <div className="flex flex-wrap items-center gap-2">
                <FilterSubmitButton />
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    nativeButton={false}
                    render={<Link href="/portal/donors" />}
                  >
                    <LinkPendingPulse>Clear</LinkPendingPulse>
                  </Button>
                )}
              </div>
            </form>
          </FiltersSheet>

          {canManage && (
            <NewPersonDialog
              people={peopleOptions ?? []}
              defaultRole="is_donor"
              triggerLabel="New Donor"
            />
          )}
        </div>

        <Card>
          <CardContent className="px-0">
            {peopleRows.length === 0 ? (
              <p className="app-muted px-4 py-6 text-sm">
                {hasActiveFilters
                  ? "No donors match your filters."
                  : "No donors added yet."}
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
                          aria-label={`View ${person.name ?? "donor"}`}
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
