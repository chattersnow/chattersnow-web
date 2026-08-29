"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type InventoryViewMode = "list" | "gallery";

const INVENTORY_VIEW_STORAGE_KEY = "chattersnow:inventory-items-view";

function isViewMode(value: unknown): value is InventoryViewMode {
  return value === "list" || value === "gallery";
}

function readStoredView(): InventoryViewMode {
  if (typeof window === "undefined") return "list";
  try {
    const stored = window.localStorage.getItem(INVENTORY_VIEW_STORAGE_KEY);
    return isViewMode(stored) ? stored : "list";
  } catch {
    return "list";
  }
}

const InventoryViewContext = createContext<{
  view: InventoryViewMode;
  setView: (next: InventoryViewMode) => void;
} | null>(null);

export function InventoryViewProvider({ children }: { children: ReactNode }) {
  const [view, setViewState] = useState<InventoryViewMode>(readStoredView);

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
