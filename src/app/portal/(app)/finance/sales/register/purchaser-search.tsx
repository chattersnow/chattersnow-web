"use client";

import { useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/portal/status-badge";
import {
  searchPeopleAction,
  type PersonHit,
} from "../../../command-palette-actions";

/**
 * Naming who bought something, optionally.
 *
 * Reuses the command palette's `searchPeopleAction` rather than a lookup of
 * its own: it already searches name, preferred name, email and phone in one
 * query, and all three roles that hold `sales:manage` hold `people:view` too,
 * so the permission the action checks is one the cashier already has. A hit is
 * kept as a removable chip, because at a merch table the mistake to protect
 * against is the name staying attached to the *next* sale.
 */
export function PurchaserSearch({
  selected,
  onSelect,
}: {
  selected: PersonHit | null;
  onSelect: (person: PersonHit | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [isSearching, startSearch] = useTransition();
  // Only the newest request may paint: a slower earlier one resolving late
  // would otherwise replace the results for what is now in the box.
  const requestRef = useRef(0);

  function handleQueryChange(next: string) {
    setQuery(next);
    const requestId = ++requestRef.current;
    if (next.trim().length < 2) {
      setHits([]);
      return;
    }
    startSearch(async () => {
      const result = await searchPeopleAction(next);
      if (requestId !== requestRef.current || "error" in result) return;
      setHits(result.people);
    });
  }

  if (selected) {
    return (
      <Field>
        <FieldLabel htmlFor="purchaser-search">Purchaser</FieldLabel>
        <div className="flex items-center gap-2">
          <StatusBadge tone="info">{selected.label}</StatusBadge>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${selected.label} as purchaser`}
            onClick={() => {
              onSelect(null);
              setQuery("");
              setHits([]);
            }}
          >
            <X />
          </Button>
        </div>
      </Field>
    );
  }

  return (
    <Field>
      <FieldLabel htmlFor="purchaser-search">Purchaser (optional)</FieldLabel>
      <Input
        id="purchaser-search"
        value={query}
        placeholder="Search by name or email..."
        onChange={(event) => handleQueryChange(event.target.value)}
      />
      {isSearching && (
        <p className="app-muted flex items-center gap-2 text-xs">
          <Spinner /> Searching...
        </p>
      )}
      {hits.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-lg border border-[var(--line)]">
          {hits.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onSelect(person);
                  setQuery("");
                  setHits([]);
                }}
              >
                <span className="font-medium">{person.label}</span>
                {person.detail && (
                  <span className="app-muted ml-2 text-xs">
                    {person.detail}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}
