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
 * `fallback`, which is what the real hook does on a URL with no tab in it;
 * the hook's own URL behaviour is covered by use-url-tab-state.dom.test.tsx.
 */
export function mockUrlTabState() {
  mock.module("@/components/portal/use-url-tab-state", () => ({
    useUrlTabState: <T extends string>({ fallback }: { fallback: T }) => {
      const [value, setValue] = useState<T>(fallback);
      return [value, setValue] as [T, (next: T) => void];
    },
  }));
}
