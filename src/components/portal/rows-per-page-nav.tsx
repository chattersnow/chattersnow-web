"use client";

import { useRouter } from "next/navigation";
import { RowsPerPageSelect } from "@/components/ui/pagination";

/**
 * The rows-per-page control for the lists that paginate through the URL
 * rather than in the browser.
 *
 * The same `Select` the client-side tables use, wired to a navigation instead
 * of a `useState` -- the split `SortHeaderLink` / `SortHeaderButton` already
 * makes for sorting.
 *
 * Takes each option's href already built rather than the function that builds
 * them: `Pagination` renders on the server, and a function cannot cross into
 * a client component. There are two options, so pre-building both costs
 * nothing.
 */
export function RowsPerPageNav({
  value,
  options,
}: {
  value: number;
  /** Each offered size with the URL that selects it. */
  options: readonly { value: number; href: string }[];
}) {
  const router = useRouter();

  return (
    <RowsPerPageSelect
      value={value}
      options={options.map((option) => option.value)}
      onChange={(next) => {
        const href = options.find((option) => option.value === next)?.href;
        if (href) router.push(href);
      }}
    />
  );
}
