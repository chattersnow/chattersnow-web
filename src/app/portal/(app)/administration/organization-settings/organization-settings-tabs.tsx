"use client";

import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTabState } from "@/components/portal/use-url-tab-state";

/**
 * The five panels, in the order the strip shows them. Exported so a link
 * elsewhere in the portal can name a tab by its value rather than by a bare
 * string -- see the ops report email and My Account.
 *
 * Eight until #990 took Layout, Page visibility and Legal documents to the
 * Website section, where the site they configure is edited. What is left is
 * the organization: its fiscal year and vocabulary, its approval thresholds,
 * its identity, its email and its data. That is why #992 renamed the page from
 * System Settings -- nothing here was ever about "the system".
 *
 * `organization` became `general` with the rename, so the page and its first
 * tab are not the same word. The value changed with the label because no link
 * in the product names this tab: the three that are written down elsewhere are
 * `workflow` and `notifications`, both untouched.
 */
export const ORGANIZATION_SETTINGS_TABS = [
  { value: "general", label: "General" },
  { value: "workflow", label: "Workflow settings" },
  { value: "branding", label: "Branding" },
  { value: "notifications", label: "Notifications" },
  { value: "data", label: "Data" },
] as const;

export type OrganizationSettingsTab =
  (typeof ORGANIZATION_SETTINGS_TABS)[number]["value"];

function isOrganizationSettingsTab(
  value: string,
): value is OrganizationSettingsTab {
  return ORGANIZATION_SETTINGS_TABS.some((tab) => tab.value === value);
}

/**
 * The tab strip, controlled from `?tab=` (#947).
 *
 * This was the portal's last uncontrolled `defaultValue` tab surface. Eight
 * panels meant eight destinations that could not be linked, bookmarked or
 * returned to with Back, and a reload always dropped the reader on the first
 * one. Being addressable is also what made #990 cheap: a tab with a URL is a
 * tab that can be redirected to the page it became.
 *
 * No permission resolution before validating the URL, unlike event detail:
 * nothing here is gated per panel. The layout admits `administration:manage`
 * or `system_settings:manage`, and a reader holding either -- the board holds
 * only the latter, and this is their one Administration page -- sees all five.
 *
 * The panels stay in the server component as children so the page keeps its
 * one batched `Promise.all` fetch.
 */
export function OrganizationSettingsTabs({
  children,
}: {
  children: ReactNode;
}) {
  const [tab, setTab] = useUrlTabState<OrganizationSettingsTab>({
    fallback: "general",
    isValid: isOrganizationSettingsTab,
  });

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as OrganizationSettingsTab)}
      className="mt-6"
    >
      <div className="rainbow-surface flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <TabsList
          variant="line"
          className="flex-wrap group-data-horizontal/tabs:h-auto"
        >
          {ORGANIZATION_SETTINGS_TABS.map((entry) => (
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
