"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addGearRequestItemAction } from "../actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import type { Lexicon } from "@/lib/lexicon";
import { RequestItemThumb } from "./request-item-thumb";

export type AddableItem = {
  id: string;
  description: string;
  size: string | null;
  photo_url: string | null;
  category_label: { label: string } | null;
};

function matches(item: AddableItem, query: string): boolean {
  const haystack = [item.description, item.size, item.category_label?.label]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * Put another gear library item on an open request (#1527), from the stock
 * that is on the shelf right now -- the same pool the public cart offers.
 */
export function AddRequestItemDialog({
  requestId,
  items,
  lexicon,
}: {
  requestId: string;
  items: AddableItem[];
  lexicon: Lexicon;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const shown = items.filter((item) => matches(item, query));

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setError(null);
    }
  }

  function handleAdd(item: AddableItem) {
    setError(null);
    setAddingId(item.id);
    startTransition(async () => {
      await runAction(() => addGearRequestItemAction(requestId, item.id), {
        success: `${item.description} added to the request.`,
        onError: setError,
        onSuccess: () => {
          handleOpenChange(false);
          router.refresh();
        },
      });
      setAddingId(null);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
          />
        }
      >
        Add {lexicon.item.toLowerCase()}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add {lexicon.item.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Only {lexicon.item_plural.toLowerCase()} on the shelf right now can
            be added. It is held for this requester until the request is
            fulfilled or cancelled.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="add-request-item-search">Search</FieldLabel>
          <Input
            id="add-request-item-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Description, size or category"
            autoComplete="off"
          />
        </Field>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {shown.length === 0 ? (
          <p className="app-muted text-sm">
            {items.length === 0
              ? `No ${lexicon.item_plural.toLowerCase()} are available.`
              : "Nothing matches that search."}
          </p>
        ) : (
          <ul className="-mx-1 flex flex-col divide-y">
            {shown.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-1 py-2">
                <RequestItemThumb photoUrl={item.photo_url} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words">
                    {item.description}
                  </p>
                  <p className="app-muted text-xs">
                    {[item.category_label?.label, item.size]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => handleAdd(item)}
                  disabled={isPending}
                  aria-label={`Add ${item.description}`}
                >
                  {addingId === item.id ? <Spinner className="size-4" /> : null}
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
