import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AddDonationModal } from "../../home/add-donation-modal";
import { FiltersSheet } from "@/components/filters-sheet";
import { FilterSubmitButton } from "@/components/filter-submit-button";
import { LinkPendingPulse } from "@/components/link-pending";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  buildHref,
  PAGE_SIZE,
  escapeLikePattern,
  pageRange,
  parsePage,
  parsePerPage,
  totalPagesFor,
} from "@/lib/pagination";
import Link from "next/link";
import { DonationsTable } from "./donations-table";
import {
  SOURCE_TYPES,
  withFlatItemCategories,
  type DonationRow,
} from "./donation-shared";

type InventoryDonationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export const metadata: Metadata = {
  title: "Gear Donations",
};

export default async function InventoryDonationsPage({
  searchParams,
}: InventoryDonationsPageProps) {
  const supabase = await createSupabaseServerClient();

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const search = raw("search") || "";
  const sourceTypeFilter = raw("sourceType") || "all";
  const eventFilter = raw("event") || "all";
  // Only the date sorts -- see the note on DonationsTable.
  const dir: "asc" | "desc" = raw("dir") === "asc" ? "asc" : "desc";
  const page = parsePage(raw("page"));
  const perPage = parsePerPage(raw("perPage"));

  const { data: events } = await supabase
    .from("events")
    .select("id, name")
    .order("starts_at", { ascending: false })
    .limit(200);
  const eventOptions = events ?? [];

  let query = supabase
    .from("donations")
    .select(
      "id, donated_at, notes, event_id, donor:people!inner(id, name, is_anonymous, source_type), event:events(id, name), inventory_items(id, description, type, category_id, size, gender, condition, face_value, status, intended_use, photo_url, notes, inventory_categories(key, label))",
      { count: "exact" },
    )
    .order("donated_at", { ascending: dir === "asc" })
    .order("id", { ascending: true });

  if (search) {
    query = query.ilike("donor.name", `%${escapeLikePattern(search)}%`);
  }
  if (sourceTypeFilter !== "all") {
    query = query.eq("donor.source_type", sourceTypeFilter);
  }
  if (eventFilter !== "all") {
    query = query.eq("event_id", eventFilter);
  }

  const { offset, to } = pageRange(page, perPage);
  const { data, count } = await query.range(offset, to);
  const donations = ((data ?? []) as unknown as DonationRow[]).map(
    withFlatItemCategories,
  );

  const filterParams = new URLSearchParams();
  if (search) filterParams.set("search", search);
  if (sourceTypeFilter !== "all")
    filterParams.set("sourceType", sourceTypeFilter);
  if (eventFilter !== "all") filterParams.set("event", eventFilter);
  // On filterParams rather than in each href, so sorting and paging both
  // carry the reader's choice without either having to remember to.
  if (perPage !== PAGE_SIZE) filterParams.set("perPage", String(perPage));

  const sortHref = buildHref("/portal/inventory/donations", filterParams, {
    dir: dir === "asc" ? "desc" : "asc",
  });

  function pageHref(nextPage: number) {
    return buildHref("/portal/inventory/donations", filterParams, {
      dir,
      page: nextPage,
    });
  }

  function perPageHref(nextPerPage: number) {
    // Back to page one: a bigger page renumbers them all, and page 4 of 9 is
    // nothing in particular once each page holds 25.
    return buildHref("/portal/inventory/donations", filterParams, {
      dir,
      perPage: nextPerPage,
      page: 1,
    });
  }

  const totalPages = totalPagesFor(count, perPage);
  const hasActiveFilters =
    !!search || sourceTypeFilter !== "all" || eventFilter !== "all";
  const activeFilterCount = [
    !!search,
    sourceTypeFilter !== "all",
    eventFilter !== "all",
  ].filter(Boolean).length;

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Donations
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-[var(--line)] p-4 shadow-md">
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
                placeholder="Search donor name..."
                defaultValue={search}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="sourceType"
                className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
              >
                Donor source
              </label>
              <select
                id="sourceType"
                name="sourceType"
                defaultValue={sourceTypeFilter}
                className={selectClassName}
              >
                <option value="all">All sources</option>
                {SOURCE_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="event"
                className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
              >
                Source event
              </label>
              <select
                id="event"
                name="event"
                defaultValue={eventFilter}
                className={selectClassName}
              >
                <option value="all">All events</option>
                {eventOptions.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
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
                  render={<Link href="/portal/inventory/donations" />}
                >
                  <LinkPendingPulse>Clear</LinkPendingPulse>
                </Button>
              )}
            </div>
          </form>
        </FiltersSheet>

        <AddDonationModal triggerLabel="Add donation" events={eventOptions} />
      </div>

      <div className="mt-6">
        <DonationsTable
          donations={donations}
          hasActiveFilters={hasActiveFilters}
          dir={dir}
          sortHref={sortHref}
        />
      </div>

      {donations.length > 0 && (
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
  );
}
