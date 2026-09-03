import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ActiveFilters, type ActiveFilter } from "@/components/active-filters";
import { FiltersSheet } from "@/components/filters-sheet";
import { SearchField } from "@/components/search-field";
import { FilterSubmitButton } from "@/components/filter-submit-button";
import { LinkPendingPulse } from "@/components/link-pending";
import { Pagination } from "@/components/ui/pagination";
import {
  buildHref,
  escapeLikePattern,
  pageRange,
  parsePage,
  totalPagesFor,
} from "@/lib/pagination";
import { InventoryTable } from "./inventory-table";
import { InventoryViewProvider } from "./inventory-view-context";
import { InventoryViewToggle } from "./inventory-view-toggle";
import {
  CONDITIONS,
  STATUSES,
  isSortColumn,
  type InventoryItem,
  type SortColumn,
} from "./inventory-shared";

type InventoryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export const metadata: Metadata = {
  title: "Inventory",
};

export default async function InventoryPage({
  searchParams,
}: InventoryPageProps) {
  const supabase = await createSupabaseServerClient();

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const search = raw("search") || "";
  const typeFilter = raw("type") || "all";
  const conditionFilter = raw("condition") || "all";
  const statusFilter = raw("status") || "all";

  const sortParam = raw("sort");
  const sort: SortColumn = isSortColumn(sortParam) ? sortParam : "description";
  const dir: "asc" | "desc" = raw("dir") === "desc" ? "desc" : "asc";

  const page = parsePage(raw("page"));

  const { data: typeRows } = await supabase
    .from("inventory_items")
    .select("type")
    .order("type", { ascending: true });
  const typeOptions = Array.from(
    new Set((typeRows ?? []).map((row) => row.type)),
  );

  let query = supabase
    .from("inventory_items")
    .select(
      "id, description, type, size, gender, condition, face_value, status, photo_url, notes",
      { count: "exact" },
    )
    .order(sort, { ascending: dir === "asc" })
    .order("id", { ascending: true });

  if (search) {
    query = query.ilike("description", `%${escapeLikePattern(search)}%`);
  }
  if (typeFilter !== "all") query = query.eq("type", typeFilter);
  if (conditionFilter !== "all") query = query.eq("condition", conditionFilter);
  if (statusFilter !== "all") query = query.eq("status", statusFilter);

  const { offset, to } = pageRange(page);
  const { data: items, count } = await query.range(offset, to);

  const reservedIds = (items ?? [])
    .filter((item) => item.status === "reserved")
    .map((item) => item.id);

  const holdByItemId = new Map<
    string,
    NonNullable<InventoryItem["holdRequester"]>
  >();
  if (reservedIds.length > 0) {
    const { data: movements } = await supabase
      .from("inventory_movements")
      .select(
        "inventory_item_id, occurred_at, recipient:people(id, name, email, phone)",
      )
      .eq("movement_type", "reserved")
      .in("inventory_item_id", reservedIds)
      .order("occurred_at", { ascending: false });

    type HoldMovement = {
      inventory_item_id: string;
      occurred_at: string;
      recipient: NonNullable<InventoryItem["holdRequester"]> | null;
    };

    for (const movement of (movements ?? []) as unknown as HoldMovement[]) {
      if (movement.recipient && !holdByItemId.has(movement.inventory_item_id)) {
        holdByItemId.set(movement.inventory_item_id, movement.recipient);
      }
    }
  }

  const itemsWithHolds: InventoryItem[] = (items ?? []).map((item) => ({
    ...item,
    holdRequester: holdByItemId.get(item.id) ?? null,
  }));

  const filterParams = new URLSearchParams();
  if (search) filterParams.set("search", search);
  if (typeFilter !== "all") filterParams.set("type", typeFilter);
  if (conditionFilter !== "all") filterParams.set("condition", conditionFilter);
  if (statusFilter !== "all") filterParams.set("status", statusFilter);

  function pageHref(nextPage: number) {
    return buildHref("/portal/inventory/items", filterParams, {
      sort,
      dir,
      page: nextPage,
    });
  }

  const totalPages = totalPagesFor(count);
  const hasActiveFilters =
    !!search ||
    typeFilter !== "all" ||
    conditionFilter !== "all" ||
    statusFilter !== "all";
  const activeFilterCount = [
    typeFilter !== "all",
    conditionFilter !== "all",
    statusFilter !== "all",
  ].filter(Boolean).length;
  // Named in the toolbar rather than hidden behind the Filters count, so a
  // partially filtered table says why it's short.
  const appliedFilters: ActiveFilter[] = [];
  if (search) {
    appliedFilters.push({ param: "search", label: "Search", value: search });
  }
  if (typeFilter !== "all") {
    appliedFilters.push({ param: "type", label: "Type", value: typeFilter });
  }
  if (conditionFilter !== "all") {
    appliedFilters.push({
      param: "condition",
      label: "Condition",
      value:
        CONDITIONS.find((option) => option.value === conditionFilter)?.label ??
        conditionFilter,
    });
  }
  if (statusFilter !== "all") {
    appliedFilters.push({
      param: "status",
      label: "Status",
      value:
        STATUSES.find((option) => option.value === statusFilter)?.label ??
        statusFilter,
    });
  }

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Inventory
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <InventoryViewProvider>
        <div className="rainbow-surface mt-6 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <InventoryViewToggle />

          <SearchField
            action="/portal/inventory/items"
            defaultValue={search}
            placeholder="Search description..."
            preserve={{
              type: typeFilter,
              condition: conditionFilter,
              status: statusFilter,
              sort,
              dir,
            }}
          />
          <FiltersSheet activeCount={activeFilterCount}>
            <form method="get" className="flex flex-col gap-4">
              <input type="hidden" name="sort" value={sort} />
              <input type="hidden" name="dir" value={dir} />

              {/* Search lives in the toolbar now; carry it through so
                  applying a filter here doesn't drop the current query. */}
              <input type="hidden" name="search" value={search} />

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="type"
                  className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
                >
                  Type
                </label>
                <select
                  id="type"
                  name="type"
                  defaultValue={typeFilter}
                  className={selectClassName}
                >
                  <option value="all">All types</option>
                  {typeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="condition"
                  className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
                >
                  Condition
                </label>
                <select
                  id="condition"
                  name="condition"
                  defaultValue={conditionFilter}
                  className={selectClassName}
                >
                  <option value="all">All conditions</option>
                  {CONDITIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
                  {STATUSES.map((option) => (
                    <option key={option.value} value={option.value}>
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
                    render={<Link href="/portal/inventory/items" />}
                  >
                    <LinkPendingPulse>Clear</LinkPendingPulse>
                  </Button>
                )}
              </div>
            </form>
          </FiltersSheet>
        </div>

        <ActiveFilters
          action="/portal/inventory/items"
          filters={appliedFilters}
          params={{
            search,
            type: typeFilter,
            condition: conditionFilter,
            status: statusFilter,
            sort,
            dir,
          }}
        />

        <div className="mt-6">
          <InventoryTable
            items={itemsWithHolds}
            sort={sort}
            dir={dir}
            filterQueryString={filterParams.toString()}
            hasActiveFilters={hasActiveFilters}
          />
        </div>
      </InventoryViewProvider>

      {itemsWithHolds.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          count={count}
          hrefFor={pageHref}
        />
      )}
    </>
  );
}
