"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FiltersSheet } from "@/components/filters-sheet";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONDITIONS, GENDERS, labelFor } from "@/lib/inventory";
import { GearCard } from "./gear-card";
import { GearDetailSheet } from "./gear-detail-sheet";
import { GearCartTray } from "./gear-cart-tray";
import { GearCartSheet } from "./gear-cart-sheet";

const PAGE_SIZE = 12;

export type GearItem = {
  id: string;
  description: string;
  size: string | null;
  /** Legacy free text / the "Other" category's detail -- see categoryLabelFor. */
  type: string | null;
  category_key: string | null;
  category_label: string | null;
  category_group_key: string | null;
  category_group_label: string | null;
  category_sort_order: number | null;
  category_group_sort_order: number | null;
  gender: string | null;
  condition: string;
  photo_url: string | null;
  created_at: string;
};

const FILTER_ALL = "all";

export function GearCatalog({
  items,
  placeholderUrl,
}: {
  items: GearItem[];
  placeholderUrl: string | null;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [conditionFilter, setConditionFilter] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<GearItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [cartIds, setCartIds] = useState<Set<string>>(new Set());
  const [cartOpen, setCartOpen] = useState(false);
  const [cartSuccess, setCartSuccess] = useState(false);

  const openCart = () => {
    setCartSuccess(false);
    setCartOpen(true);
  };

  const toggleCartItem = (itemId: string) => {
    setCartIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const cartItems = items.filter((item) => cartIds.has(item.id));

  // Built from the categories actually present in the catalog, grouped and in
  // the admin's own sort order -- not from de-duped free text, and not from the
  // whole vocabulary, so a category with nothing available isn't offered
  // (issue #667).
  const typeGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        label: string;
        sort: number;
        options: Map<string, { label: string; sort: number }>;
      }
    >();
    for (const item of items) {
      if (!item.category_key || !item.category_group_key) continue;
      const groupKey = item.category_group_key;
      let group = groups.get(groupKey);
      if (!group) {
        group = {
          label: item.category_group_label ?? groupKey,
          sort: item.category_group_sort_order ?? 0,
          options: new Map(),
        };
        groups.set(groupKey, group);
      }
      if (!group.options.has(item.category_key)) {
        group.options.set(item.category_key, {
          label: item.category_label ?? item.category_key,
          sort: item.category_sort_order ?? 0,
        });
      }
    }
    return [...groups.entries()]
      .sort((a, b) => a[1].sort - b[1].sort)
      .map(([key, group]) => ({
        key,
        label: group.label,
        options: [...group.options.entries()]
          .sort((a, b) => a[1].sort - b[1].sort)
          .map(([optionKey, option]) => ({
            key: optionKey,
            label: option.label,
          })),
      }));
  }, [items]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      if (typeFilter && item.category_key !== typeFilter) return false;
      if (conditionFilter && item.condition !== conditionFilter) return false;
      if (genderFilter && item.gender !== genderFilter) return false;
      if (query && !item.description.toLowerCase().includes(query))
        return false;
      return true;
    });
  }, [items, search, typeFilter, conditionFilter, genderFilter]);

  const totalPages = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedItems = visibleItems.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const activeFilterCount = [typeFilter, conditionFilter, genderFilter].filter(
    Boolean,
  ).length;

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleTypeFilterChange(value: string | null) {
    setTypeFilter(value);
    setPage(1);
  }

  function handleConditionFilterChange(value: string | null) {
    setConditionFilter(value);
    setPage(1);
  }

  function handleGenderFilterChange(value: string | null) {
    setGenderFilter(value);
    setPage(1);
  }

  if (items.length === 0) {
    return (
      <p className="app-muted py-16 text-center text-sm">
        No gear is currently available.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rainbow-surface flex flex-wrap items-end gap-4 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="gear-search"
            className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
          >
            Search
          </label>
          <Input
            id="gear-search"
            placeholder="Search description..."
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            className="h-8 w-full bg-card sm:w-64"
          />
        </div>

        <FiltersSheet activeCount={activeFilterCount}>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="gear-type-filter"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Type
            </label>
            <Select
              value={typeFilter ?? FILTER_ALL}
              onValueChange={(value) =>
                handleTypeFilterChange(value === FILTER_ALL ? null : value)
              }
            >
              <SelectTrigger id="gear-type-filter">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All types</SelectItem>
                {typeGroups.map((group) => (
                  <SelectGroup key={group.key}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.options.map((option) => (
                      <SelectItem key={option.key} value={option.key}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="gear-condition-filter"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Condition
            </label>
            <Select
              value={conditionFilter ?? FILTER_ALL}
              onValueChange={(value) =>
                handleConditionFilterChange(value === FILTER_ALL ? null : value)
              }
            >
              <SelectTrigger id="gear-condition-filter">
                <SelectValue placeholder="Condition">
                  {(value: string) =>
                    value === FILTER_ALL
                      ? "All conditions"
                      : (labelFor(CONDITIONS, value) ?? "Condition")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All conditions</SelectItem>
                {CONDITIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="gear-gender-filter"
              className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
            >
              Gender
            </label>
            <Select
              value={genderFilter ?? FILTER_ALL}
              onValueChange={(value) =>
                handleGenderFilterChange(value === FILTER_ALL ? null : value)
              }
            >
              <SelectTrigger id="gear-gender-filter">
                <SelectValue placeholder="Gender">
                  {(value: string) =>
                    value === FILTER_ALL
                      ? "All genders"
                      : (labelFor(GENDERS, value) ?? "Gender")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL}>All genders</SelectItem>
                {GENDERS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FiltersSheet>
      </div>

      {visibleItems.length === 0 ? (
        <p className="app-muted py-16 text-center text-sm">
          No gear matches your filters.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {pagedItems.map((item) => (
              <GearCard
                key={item.id}
                item={item}
                onSelect={() => {
                  setSelectedItem(item);
                  setDetailOpen(true);
                }}
                inCart={cartIds.has(item.id)}
                onToggleCart={() => toggleCartItem(item.id)}
                placeholderUrl={placeholderUrl}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="app-muted text-sm">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <GearDetailSheet
        item={selectedItem}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        inCart={selectedItem ? cartIds.has(selectedItem.id) : false}
        onToggleCart={() => selectedItem && toggleCartItem(selectedItem.id)}
        placeholderUrl={placeholderUrl}
      />

      <GearCartTray count={cartItems.length} onOpen={openCart} />
      <GearCartSheet
        items={cartItems}
        open={cartOpen}
        onOpenChange={setCartOpen}
        onRemove={toggleCartItem}
        success={cartSuccess}
        onSubmitted={() => {
          setCartSuccess(true);
          setCartIds(new Set());
        }}
        placeholderUrl={placeholderUrl}
      />
    </div>
  );
}
