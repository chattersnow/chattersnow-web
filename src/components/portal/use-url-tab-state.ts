"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Keeps a detail page's active tab in the URL instead of in React state.
 *
 * Event and meeting detail read `?tab=` once on mount and then held the tab
 * in `useState`, never writing back. On a 17-tab event page that meant the
 * Back button left the event entirely rather than returning to the previous
 * phase, the URL couldn't be shared to point at a colleague's tab, and a
 * refresh dropped back to Overview. `?tab=` worked as an entry point but not
 * as state.
 *
 * Written with `history.pushState` rather than `router.push`: the tab is
 * client-side state, and a router navigation would re-run the page's server
 * component and its queries on every tab click. Next's `useSearchParams`
 * still observes the change, so the value stays the single source of truth.
 * pushState (not replaceState) is what gives Back its expected meaning here.
 *
 * The setter takes optional companion params, written in the same pushState.
 * That is for a second level of tabs (#958 nests a card strip inside event
 * detail's phases): changing the outer tab has to reset the inner one, and two
 * setter calls in a row would not do it -- both read the same render's
 * `searchParams`, so the second write would drop the first.
 */
export function useUrlTabState<T extends string>({
  param = "tab",
  fallback,
  isValid,
}: {
  param?: string;
  fallback: T;
  /** Guards against a hand-edited or stale value in the URL. */
  isValid: (value: string) => value is T;
}): [T, (next: T, companions?: Record<string, string>) => void] {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get(param);
  const value = raw !== null && isValid(raw) ? raw : fallback;

  const setValue = useCallback(
    (next: T, companions?: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(param, next);
      for (const [key, companion] of Object.entries(companions ?? {})) {
        params.set(key, companion);
      }
      const query = params.toString();
      window.history.pushState(
        null,
        "",
        query ? `${pathname}?${query}` : pathname,
      );
    },
    [pathname, searchParams, param],
  );

  return [value, setValue];
}
