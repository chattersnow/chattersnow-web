import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AddDonationModal } from "../../home/add-donation-modal";
import { FiltersSheet } from "@/components/filters-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  buildHref,
  escapeLikePattern,
  pageRange,
  parsePage,
  totalPagesFor,
} from "@/lib/pagination";
import Link from "next/link";
import { DonationsTable } from "./donations-table";
import { SOURCE_TYPES, type DonationRow } from "./donation-shared";

type InventoryDonationsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

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
  const page = parsePage(raw("page"));

  const { data: events } = await supabase
    .from("events")
    .select("id, name")
    .order("starts_at", { ascending: false })
    .limit(200);
  const eventOptions = events ?? [];

  let query = supabase
    .from("donations")
    .select(
      "id, donated_at, notes, event_id, donor:people!inner(id, name, is_anonymous, source_type), event:events(id, name), inventory_items(id, description, type, size, gender, condition, face_value, status, photo_url, notes)",
      { count: "exact" },
    )
    .order("donated_at", { ascending: false })
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

  const { offset, to } = pageRange(page);
  const { data, count } = await query.range(offset, to);
  const donations = (data ?? []) as unknown as DonationRow[];

  const filterParams = new URLSearchParams();
  if (search) filterParams.set("search", search);
  if (sourceTypeFilter !== "all")
    filterParams.set("sourceType", sourceTypeFilter);
  if (eventFilter !== "all") filterParams.set("event", eventFilter);

  function pageHref(nextPage: number) {
    return buildHref("/portal/inventory/donations", filterParams, {
      page: nextPage,
    });
  }

  const totalPages = totalPagesFor(count);
  const hasActiveFilters =
    !!search || sourceTypeFilter !== "all" || eventFilter !== "all";
  const activeFilterCount = [
    !!search,
    sourceTypeFilter !== "all",
    eventFilter !== "all",
  ].filter(Boolean).length;

  return (
    <>
      <div className="rainbow-accent w-16" />
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Donations
      </h1>

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
              <Button type="submit" variant="secondary">
                Filter
              </Button>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  nativeButton={false}
                  render={<Link href="/portal/inventory/donations" />}
                >
                  Clear
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
        />
      </div>

      {donations.length > 0 && (
        <Pagination page={page} totalPages={totalPages} hrefFor={pageHref} />
      )}
    </>
  );
}
