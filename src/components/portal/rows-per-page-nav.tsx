"use client";

import { useRouter } from "next/navigation";
import { RowsPerPageSelect } from "@/components/ui/pagination";

/**
 * The rows-per-page control for the lists that paginate through the URL
 * rather than in the browser.
 *
 * The same `Select` the client-side tables use, wired to a navigation instead
 * of a `useState` -- the split `SortHeaderLink` / `SortHeaderButton` already
 * makes for sorting. It stays a component of its own because it is the only
 * part of the server-rendered pager that needs to be a client component.
 */
export function RowsPerPageNav({
  value,
  hrefFor,
}: {
  value: number;
  /** Must reset the page: a bigger page size renumbers every page. */
  hrefFor: (perPage: number) => string;
}) {
  const router = useRouter();

  return (
    <RowsPerPageSelect
      value={value}
      onChange={(next) => router.push(hrefFor(next))}
    />
  );
}
