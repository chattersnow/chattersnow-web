"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FiltersSheet } from "@/components/filters-sheet";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
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
  type: string;
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

  const typeOptions = useMemo(
    () => Array.from(new Set(items.map((item) => item.type))).sort(),
    [items],
  );

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      if (typeFilter && item.type !== typeFilter) return false;
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
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-4 shadow-md">
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
            className="h-8 w-full bg-white sm:w-64"
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
                {typeOptions.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
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
