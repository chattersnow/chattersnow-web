import { DependencyList, useEffect, useRef, useState } from "react";

type FetchResult<T> = { error: string } | { data: T };

export function useTabData<T>(
  fetcher: () => Promise<FetchResult<T>>,
  active: boolean,
  deps: DependencyList = [],
): { data: T | undefined; loadError: string | null; refresh: () => void } {
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
    if (!active) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps]);

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
