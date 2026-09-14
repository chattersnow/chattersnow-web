"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type InventoryViewMode = "list" | "gallery";

const INVENTORY_VIEW_STORAGE_KEY = "chattersnow:inventory-items-view";

function isViewMode(value: unknown): value is InventoryViewMode {
  return value === "list" || value === "gallery";
}

function readStoredView(fallback: InventoryViewMode): InventoryViewMode {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(INVENTORY_VIEW_STORAGE_KEY);
    return isViewMode(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

const InventoryViewContext = createContext<{
  view: InventoryViewMode;
  setView: (next: InventoryViewMode) => void;
} | null>(null);

/**
 * `defaultView` is the starting point for a reader who has never chosen, and
 * the page passes `gallery` on a phone (#1090): the grid is already
 * `grid-cols-2` at 390px with `sizes="50vw"`, and picking a gear item out of
 * a 2-up wall of photographs beats reading a four-column table through a
 * sideways scroll. It is a default and nothing more -- a stored choice still
 * wins in both directions, which is why the toggle stays device-agnostic.
 */
export function InventoryViewProvider({
  children,
  defaultView = "list",
}: {
  children: ReactNode;
  defaultView?: InventoryViewMode;
}) {
  const [view, setViewState] = useState<InventoryViewMode>(() =>
    readStoredView(defaultView),
  );

  function setView(next: InventoryViewMode) {
    setViewState(next);
    try {
      window.localStorage.setItem(INVENTORY_VIEW_STORAGE_KEY, next);
    } catch {
      // ignore storage failures (private browsing, disabled storage, etc.)
    }
  }

  return (
    <InventoryViewContext.Provider value={{ view, setView }}>
      {children}
    </InventoryViewContext.Provider>
  );
}

export function useInventoryView() {
  const context = useContext(InventoryViewContext);
  if (!context) {
    throw new Error(
      "useInventoryView must be used within an InventoryViewProvider",
    );
  }
  return context;
}
