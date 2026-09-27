"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
  assignNumberedCodeAction,
  searchItemsForCodeAction,
  type CodeItemMatch,
} from "../../inventory/items/codes/actions";
import { itemHref } from "../../inventory/items/inventory-shared";

/**
 * "Assign to an item" for a free numbered code (#1444), on the page its tag
 * opens: find the item it is being stuck to, and put the code on it.
 */
export function AssignFreeCode({ code }: { code: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CodeItemMatch[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [, startAssign] = useTransition();

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startSearch(async () => {
      const result = await searchItemsForCodeAction(query);
      if ("error" in result) {
        setMessage(result.error);
        return;
      }
      setResults(result.data);
    });
  }

  function assign(item: CodeItemMatch) {
    setMessage(null);
    setAssigningId(item.id);
    startAssign(async () => {
      const result = await assignNumberedCodeAction(item.id, code);
      setAssigningId(null);
      if ("error" in result) {
        setMessage(result.error);
        return;
      }
      if (result.outcome === "held") {
        setMessage(
          `${result.code} was just put on ${result.holder.description}. Reload to see it.`,
        );
        return;
      }
      toast.success(`${result.code} is on ${item.description} now.`);
      router.push(itemHref(item.id));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={search} className="flex flex-wrap items-end gap-2">
        <Field className="w-auto grow">
          <FieldLabel htmlFor="assign-code-search">Find the item</FieldLabel>
          <Input
            id="assign-code-search"
            type="search"
            minLength={2}
            required
            placeholder="Helmet, jacket…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={isSearching}>
          {isSearching ? <Spinner /> : <Search />} Search
        </Button>
      </form>

      <div aria-live="polite" className="flex flex-col gap-2">
        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {results?.length === 0 && (
          <p className="app-muted text-sm">
            No item in stock matches “{query.trim()}”.
          </p>
        )}
        {results && results.length > 0 && (
          <ul className="flex flex-col divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
            {results.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="min-w-0 text-sm">
                  {item.size
                    ? `${item.description} (${item.size})`
                    : item.description}
                  {item.numberedCode && (
                    <span className="app-muted">
                      {" "}
                      · has {item.numberedCode}
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={assigningId !== null}
                  onClick={() => assign(item)}
                >
                  {assigningId === item.id && <Spinner />} Assign {code}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
