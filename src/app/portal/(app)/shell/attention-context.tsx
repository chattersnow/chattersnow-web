"use client";

import { createContext, useContext } from "react";
import type { PendingApprovalItem } from "@/lib/portal/attention-items";

const AttentionItemsContext = createContext<PendingApprovalItem[]>([]);

/**
 * The layout's attention items, made readable from inside a page (#1079).
 *
 * The mobile dashboard leads with what needs the reader now, and those items
 * are computed in the portal layout -- seven queries whose cost the layout's
 * own comment calls out. A page cannot reach a layout's data, and re-running
 * the summaries on the dashboard would put that cost on every mobile load
 * twice. They are already serialized into the mobile response for the header's
 * bell, so this hands the same array to the page rather than fetching it
 * again.
 *
 * Provided by `PortalShellMobile` only: the desktop dashboard has the bell and
 * a screen wide enough not to need the list.
 */
export function AttentionItemsProvider({
  items,
  children,
}: {
  items: PendingApprovalItem[];
  children: React.ReactNode;
}) {
  return (
    <AttentionItemsContext.Provider value={items}>
      {children}
    </AttentionItemsContext.Provider>
  );
}

export function useAttentionItems() {
  return useContext(AttentionItemsContext);
}
