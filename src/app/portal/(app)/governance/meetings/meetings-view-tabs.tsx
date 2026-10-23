"use client";

import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTabState } from "@/components/portal/use-url-tab-state";

export const MEETINGS_VIEW_TABS = [
  { value: "meetings", label: "Meetings" },
  { value: "action-items", label: "Action items" },
] as const;

export type MeetingsViewTab = (typeof MEETINGS_VIEW_TABS)[number]["value"];

function isMeetingsViewTab(value: string): value is MeetingsViewTab {
  return MEETINGS_VIEW_TABS.some((tab) => tab.value === value);
}

/**
 * Two views of the meetings record (#1659): the meetings themselves, and the
 * action items they produced, across every meeting. Held in `?tab=`, so the
 * owner and due filters the Action items view writes beside it make a link
 * that opens the same filtered list.
 */
export function MeetingsViewTabs({ children }: { children: ReactNode }) {
  const [tab, setTab] = useUrlTabState<MeetingsViewTab>({
    fallback: "meetings",
    isValid: isMeetingsViewTab,
  });

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as MeetingsViewTab)}
      className="mt-6"
    >
      <TabsList variant="line">
        {MEETINGS_VIEW_TABS.map((entry) => (
          <TabsTrigger key={entry.value} value={entry.value}>
            {entry.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}
