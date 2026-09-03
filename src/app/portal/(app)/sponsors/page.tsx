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
import { SearchField } from "@/components/search-field";
import { LinkPendingPulse } from "@/components/link-pending";
import { NewPersonDialog } from "../people/new-person-dialog";
import { rolesFor, type PersonRow } from "../people/people-shared";

type SponsorsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Sponsors",
};

export default async function SponsorsPage({
  searchParams,
}: SponsorsPageProps) {
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
      "id, name, email, phone, instagram_handle, notes, logo_url, website, is_donor, is_sponsor, is_volunteer, is_organization, is_attendee, riding_discipline, ski_experience_level, snowboard_experience_level, preferred_mountain, primary_contact_person_id, primary_contact:primary_contact_person_id(id, name, email, phone)",
      { count: "exact" },
    )
    .eq("is_sponsor", true)
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
      .select(
        "id, name, preferred_name, email, phone, is_sponsor, is_organization, auth_user_id",
      )
      .order("name", { ascending: true }),
  ]);
  const peopleRows = (people ?? []) as unknown as PersonRow[];

  const filterParams = new URLSearchParams();
  if (search) filterParams.set("search", search);

  function pageHref(nextPage: number) {
    return buildHref("/portal/sponsors", filterParams, { page: nextPage });
  }

  const totalPages = totalPagesFor(count);
  const hasActiveFilters = !!search;

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Sponsors
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6 space-y-4">
        <div className="rainbow-surface flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <SearchField
            action="/portal/sponsors"
            defaultValue={search}
            placeholder="Search name, email, phone..."
          />

          {canManage && (
            <NewPersonDialog
              people={peopleOptions ?? []}
              defaultRole="is_sponsor"
              triggerLabel="New Sponsor"
            />
          )}
        </div>

        <Card>
          <CardContent className="px-0">
            {peopleRows.length === 0 ? (
              <p className="app-muted px-4 py-6 text-sm">
                {hasActiveFilters
                  ? "No sponsors match your filters."
                  : "No sponsors added yet."}
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
                          aria-label={`View ${person.name ?? "sponsor"}`}
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
            hrefFor={pageHref}
          />
        )}
      </div>
    </>
  );
}
