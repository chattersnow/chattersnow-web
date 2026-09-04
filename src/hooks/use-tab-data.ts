import { DependencyList, useEffect, useRef, useState } from "react";

type FetchResult<T> = { error: string } | { data: T };

export type TabData<T> = {
  data: T | undefined;
  loadError: string | null;
  refresh: () => void;
};

/**
 * Loads a tab's data on mount and whenever `deps` change.
 *
 * Mounting is the gate: the detail views render each phase's cards inside a
 * Base UI `Tabs.Panel`, which unmounts the phases you aren't looking at. Pass
 * `enabled: false` only for a fetch that additionally depends on some state --
 * a report having been submitted, a giveaway row existing -- not to defer a
 * fetch until its tab is on screen.
 */
export function useTabData<T>(
  fetcher: () => Promise<FetchResult<T>>,
  deps: DependencyList = [],
  enabled: boolean = true,
): TabData<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  function refresh() {
    fetcherRef.current().then((result) => {
      if ("error" in result) {
        setLoadError(result.error);
      } else {
        setLoadError(null);
        setData(result.data);
      }
    });
  }

  useEffect(() => {
    if (!enabled) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return { data, loadError, refresh };
}

export function useResetOnModeChange(
  mode: "view" | "edit",
  onReset: () => void,
): void {
  const [prevMode, setPrevMode] = useState(mode);

  if (mode !== prevMode) {
    setPrevMode(mode);
    if (mode === "view") onReset();
  }
}
