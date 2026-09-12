"use client";

import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTabState } from "@/components/portal/use-url-tab-state";

/**
 * The eight panels, in the order the strip shows them. Exported so a link
 * elsewhere in the portal can name a tab by its value rather than by a bare
 * string -- see the Website content editor and the ops report email.
 */
export const SYSTEM_SETTINGS_TABS = [
  { value: "organization", label: "Organization" },
  { value: "workflow", label: "Workflow settings" },
  { value: "branding", label: "Branding" },
  { value: "layout", label: "Layout" },
  { value: "visibility", label: "Page visibility" },
  { value: "legal", label: "Legal documents" },
  { value: "notifications", label: "Notifications" },
  { value: "data", label: "Data" },
] as const;

export type SystemSettingsTab = (typeof SYSTEM_SETTINGS_TABS)[number]["value"];

function isSystemSettingsTab(value: string): value is SystemSettingsTab {
  return SYSTEM_SETTINGS_TABS.some((tab) => tab.value === value);
}

/**
 * The tab strip, controlled from `?tab=` (#947).
 *
 * This was the portal's last uncontrolled `defaultValue` tab surface. Eight
 * panels meant eight destinations that could not be linked, bookmarked or
 * returned to with Back, and a reload always dropped the reader on
 * Organization. The Legal documents panel already linked out to the Website
 * editor's legal page, and the reverse link could not exist because there was
 * no URL to point at.
 *
 * No permission resolution before validating the URL, unlike event detail:
 * nothing here is gated per panel. The layout admits `administration:manage`
 * or `system_settings:manage`, and a reader holding either -- the board holds
 * only the latter, and this is their one Administration page -- sees all
 * eight.
 *
 * The panels stay in the server component as children so the page keeps its
 * one batched `Promise.all` fetch.
 */
export function SystemSettingsTabs({ children }: { children: ReactNode }) {
  const [tab, setTab] = useUrlTabState<SystemSettingsTab>({
    fallback: "organization",
    isValid: isSystemSettingsTab,
  });

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as SystemSettingsTab)}
      className="mt-6"
    >
      <div className="rainbow-surface flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <TabsList
          variant="line"
          className="flex-wrap group-data-horizontal/tabs:h-auto"
        >
          {SYSTEM_SETTINGS_TABS.map((entry) => (
            <TabsTrigger key={entry.value} value={entry.value}>
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {children}
    </Tabs>
  );
}
