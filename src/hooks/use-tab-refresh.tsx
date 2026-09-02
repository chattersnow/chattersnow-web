"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

type TabRefreshApi = {
  register: (key: string, fn: () => void) => () => void;
  notify: (key: string) => void;
};

// Tab components render standalone in their own tests/storybooks as well as
// inside the real event/meeting detail pages, so falling back to no-ops
// outside a provider (rather than throwing) keeps them usable either way.
const NOOP_API: TabRefreshApi = {
  register: () => () => {},
  notify: () => {},
};

const TabRefreshContext = createContext<TabRefreshApi>(NOOP_API);

export function TabRefreshProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef<Map<string, Set<() => void>>>(new Map());

  const register = useCallback((key: string, fn: () => void) => {
    if (!listenersRef.current.has(key)) {
      listenersRef.current.set(key, new Set());
    }
    listenersRef.current.get(key)!.add(fn);
    return () => {
      listenersRef.current.get(key)?.delete(fn);
    };
  }, []);

  const notify = useCallback((key: string) => {
    listenersRef.current.get(key)?.forEach((fn) => fn());
  }, []);

  return (
    <TabRefreshContext.Provider value={{ register, notify }}>
      {children}
    </TabRefreshContext.Provider>
  );
}

export function useTabRefresh<K extends string>(): {
  notify: (key: K) => void;
} {
  return useContext(TabRefreshContext);
}

// Registers `refresh` to run whenever the toolbar notifies `key`. Always
// invokes the latest `refresh` closure, so callers don't need to memoize it.
export function useRegisterTabRefresh<K extends string>(
  key: K,
  refresh: () => void,
) {
  const ctx = useContext(TabRefreshContext);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  useEffect(() => ctx.register(key, () => refreshRef.current()), [key, ctx]);
}
