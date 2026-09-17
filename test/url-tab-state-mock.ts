import { mock } from "bun:test";
import { useState } from "react";

/**
 * Test double for useUrlTabState, which reads the URL through
 * next/navigation and writes it with history.pushState. Neither is wired up
 * under happy-dom, so tab switching would be inert and every test that
 * changes tabs would fail for a reason unrelated to the component under
 * test.
 *
 * Call before importing the component. Behaves like useState seeded from
 * `fallback`, which is what the real hook does on a URL with no tab in it,
 * plus the one other thing the real hook guarantees: a value the current tab
 * set no longer contains reads as absent and falls back. Nested strips need
 * that -- event detail's card tabs (#958) share one parameter across four
 * phases, so moving phase leaves the held value belonging to the phase you
 * left. The hook's own URL behaviour, companion params included, is covered
 * by use-url-tab-state.dom.test.tsx.
 *
 * The returned `seed` stands in for a deep link: call it before `render` and
 * the next mount opens on that tab, as `?tab=<value>` in the URL would. A tab
 * reached by a link rather than a click is a real entry point -- the daily
 * digest sends people into one -- and nothing else in these tests exercises a
 * panel that was never clicked into.
 */
export function mockUrlTabState() {
  let seeded: string | null = null;

  mock.module("@/components/portal/use-url-tab-state", () => ({
    useUrlTabState: <T extends string>({
      fallback,
      isValid,
    }: {
      fallback: T;
      isValid: (value: string) => value is T;
    }) => {
      const [value, setValue] = useState<T>(() =>
        seeded !== null && isValid(seeded) ? seeded : fallback,
      );
      return [isValid(value) ? value : fallback, setValue] as [
        T,
        (next: T) => void,
      ];
    },
  }));

  return {
    /** The tab the next mount starts on; null restores the fallback. */
    seed(value: string | null) {
      seeded = value;
    },
  };
}
