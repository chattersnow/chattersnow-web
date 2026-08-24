"use client";

import { useMemo, useState } from "react";
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

export function GearCatalog({ items }: { items: GearItem[] }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [conditionFilter, setConditionFilter] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState<string | null>(null);

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

  if (items.length === 0) {
    return (
      <p className="app-muted py-16 text-center text-sm">
        No gear is currently available.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
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
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 w-full sm:w-64"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
            Type
          </label>
          <Select
            value={typeFilter ?? FILTER_ALL}
            onValueChange={(value) =>
              setTypeFilter(value === FILTER_ALL ? null : value)
            }
          >
            <SelectTrigger className="h-8">
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
          <label className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
            Condition
          </label>
          <Select
            value={conditionFilter ?? FILTER_ALL}
            onValueChange={(value) =>
              setConditionFilter(value === FILTER_ALL ? null : value)
            }
          >
            <SelectTrigger className="h-8">
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
          <label className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
            Gender
          </label>
          <Select
            value={genderFilter ?? FILTER_ALL}
            onValueChange={(value) =>
              setGenderFilter(value === FILTER_ALL ? null : value)
            }
          >
            <SelectTrigger className="h-8">
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
      </div>

      {visibleItems.length === 0 ? (
        <p className="app-muted py-16 text-center text-sm">
          No gear matches your filters.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visibleItems.map((item) => (
            <GearCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
