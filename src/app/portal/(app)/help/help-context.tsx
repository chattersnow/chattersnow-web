"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type HelpEntry = {
  title: string;
  /** One-line summary shown under the sheet title. */
  description?: string;
  body: ReactNode;
};

type HelpContextValue = {
  override: HelpEntry | null;
  setOverride: (entry: HelpEntry | null) => void;
};

const HelpContext = createContext<HelpContextValue | null>(null);

export function PortalHelpProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<HelpEntry | null>(null);
  return (
    <HelpContext.Provider value={{ override, setOverride }}>
      {children}
    </HelpContext.Provider>
  );
}

export function usePortalHelp(): HelpContextValue {
  const value = useContext(HelpContext);
  if (!value) {
    throw new Error("usePortalHelp must be used inside PortalHelpProvider");
  }
  return value;
}

/**
 * Renders nothing in place; registers page-specific help for the header's
 * help button while the page is mounted. Only needed when the content
 * depends on data fetched by the page (e.g. a live approval threshold) —
 * static content belongs in the help-content registry instead.
 */
export function PageHelpContent({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { setOverride } = usePortalHelp();
  useEffect(() => {
    setOverride({ title, description, body: children });
    return () => setOverride(null);
  }, [title, description, children, setOverride]);
  return null;
}
