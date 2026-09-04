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
  INTENDED_USES,
  STATUSES,
  isSortColumn,
  type InventoryItem,
  type SortColumn,
} from "./inventory-shared";
import {
  groupInventoryCategories,
  toInventoryCategories,
  UNCATEGORIZED,
  UNCATEGORIZED_LABEL,
} from "@/lib/inventory";

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
  const categoryFilter = raw("category") || "all";
  const conditionFilter = raw("condition") || "all";
  const statusFilter = raw("status") || "all";
  const intendedUseFilter = raw("intendedUse") || "all";

  const sortParam = raw("sort");
  const sort: SortColumn = isSortColumn(sortParam) ? sortParam : "description";
  const dir: "asc" | "desc" = raw("dir") === "desc" ? "desc" : "asc";

  const page = parsePage(raw("page"));

  // The vocabulary itself, not a scan of every value ever typed: the old
  // version selected the whole `type` column and de-duped it client-side, so
  // every spelling variant became its own option (issue #667).
  const { data: categoryRows } = await supabase
    .from("inventory_categories")
    .select(
      "id, key, label, is_active, sort_order, inventory_category_groups(key, label, sort_order)",
    );
  const categories = toInventoryCategories(categoryRows);
  const categoryGroups = groupInventoryCategories(categories);
  const activeCategories = categories.filter((category) => category.isActive);

  // Reads from the view rather than the base table: "Category" is a sortable
  // column, and PostgREST cannot order a row by an embedded resource's column.
  let query = supabase
    .from("inventory_items_with_category")
    .select(
      "id, description, type, size, gender, condition, face_value, status, intended_use, photo_url, notes, category_id, category_key, category_label, category_group_label, category_sort_key",
      { count: "exact" },
    )
    .order(sort === "category" ? "category_sort_key" : sort, {
      ascending: dir === "asc",
    })
    .order("id", { ascending: true });

  if (search) {
    query = query.ilike("description", `%${escapeLikePattern(search)}%`);
  }
  if (categoryFilter === UNCATEGORIZED) {
    query = query.is("category_id", null);
  } else if (categoryFilter.startsWith("group:")) {
    // Selecting a whole group filters to its categories -- the roll-up the
    // two-level vocabulary exists for.
    const groupKey = categoryFilter.slice("group:".length);
    query = query.in(
      "category_id",
      categories
        .filter((category) => category.groupKey === groupKey)
        .map((category) => category.id),
    );
  } else if (categoryFilter !== "all") {
    query = query.eq("category_id", categoryFilter);
  }
  if (conditionFilter !== "all") query = query.eq("condition", conditionFilter);
  if (statusFilter !== "all") query = query.eq("status", statusFilter);
  if (intendedUseFilter !== "all")
    query = query.eq("intended_use", intendedUseFilter);

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
  if (categoryFilter !== "all") filterParams.set("category", categoryFilter);
  if (conditionFilter !== "all") filterParams.set("condition", conditionFilter);
  if (statusFilter !== "all") filterParams.set("status", statusFilter);
  if (intendedUseFilter !== "all")
    filterParams.set("intendedUse", intendedUseFilter);

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
    categoryFilter !== "all" ||
    conditionFilter !== "all" ||
    statusFilter !== "all" ||
    intendedUseFilter !== "all";
  const activeFilterCount = [
    categoryFilter !== "all",
    conditionFilter !== "all",
    statusFilter !== "all",
    intendedUseFilter !== "all",
  ].filter(Boolean).length;
  // A filter value is an id, a "group:<key>" token or "uncategorized"; the chip
  // has to show what a human picked, not the token.
  function categoryFilterLabel(value: string) {
    if (value === UNCATEGORIZED) return UNCATEGORIZED_LABEL;
    if (value.startsWith("group:")) {
      const groupKey = value.slice("group:".length);
      return (
        categoryGroups.find((group) => group.key === groupKey)?.label ??
        groupKey
      );
    }
    return categories.find((category) => category.id === value)?.label ?? value;
  }

  // Named in the toolbar rather than hidden behind the Filters count, so a
  // partially filtered table says why it's short.
  const appliedFilters: ActiveFilter[] = [];
  if (search) {
    appliedFilters.push({ param: "search", label: "Search", value: search });
  }
  if (categoryFilter !== "all") {
    appliedFilters.push({
      param: "category",
      label: "Category",
      value: categoryFilterLabel(categoryFilter),
    });
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
  if (intendedUseFilter !== "all") {
    appliedFilters.push({
      param: "intendedUse",
      label: "Intended use",
      value:
        INTENDED_USES.find((option) => option.value === intendedUseFilter)
          ?.label ?? intendedUseFilter,
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
              category: categoryFilter,
              condition: conditionFilter,
              status: statusFilter,
              intendedUse: intendedUseFilter,
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
                  htmlFor="category"
                  className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
                >
                  Category
                </label>
                <select
                  id="category"
                  name="category"
                  defaultValue={categoryFilter}
                  className={selectClassName}
                >
                  <option value="all">All categories</option>
                  <option value={UNCATEGORIZED}>{UNCATEGORIZED_LABEL}</option>
                  {categoryGroups.map((group) => (
                    <optgroup key={group.key} label={group.label}>
                      <option value={`group:${group.key}`}>
                        All {group.label.toLowerCase()}
                      </option>
                      {group.categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </optgroup>
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

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="intendedUse"
                  className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
                >
                  Intended use
                </label>
                <select
                  id="intendedUse"
                  name="intendedUse"
                  defaultValue={intendedUseFilter}
                  className={selectClassName}
                >
                  <option value="all">All intended uses</option>
                  {INTENDED_USES.map((option) => (
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
            category: categoryFilter,
            condition: conditionFilter,
            status: statusFilter,
            intendedUse: intendedUseFilter,
            sort,
            dir,
          }}
        />

        <div className="mt-6">
          <InventoryTable
            items={itemsWithHolds}
            categories={activeCategories}
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
