import { redirect } from "next/navigation";

/**
 * System Settings became Organization Settings in #992, and three of its tabs
 * left for the Website section in #990. One stub answers both.
 *
 * The query string is what makes it worth writing carefully. `?tab=` deep
 * links have existed since #947 made the strip URL-controlled, and three of
 * them are written down elsewhere in the product: My Account links to
 * `?tab=notifications`, the daily ops report email links to the same, and the
 * finance threshold help links to `?tab=workflow`. Those three tabs are still
 * on the renamed page, so they ride along unchanged.
 *
 * The three that moved are redirected to their new routes instead, since the
 * renamed page no longer has a tab by that name and `useUrlTabState` would
 * silently fall back to the first one -- landing a bookmark for Page
 * visibility on General with no hint that anything happened.
 *
 * A route rather than a `next.config.ts` redirect, for the reason given in
 * administration/access-management/page.tsx: the portal is served both as
 * `/portal/...` paths and prefix-free on a `portal.` host.
 *
 * No layout of its own, so no guard: this resolves to a redirect before
 * anything is rendered, and every destination gates itself. Administration's
 * own layout still sits above it.
 */
const MOVED_TABS: Record<string, string> = {
  layout: "/portal/website/page-layout",
  visibility: "/portal/website/page-visibility",
  legal: "/portal/website/legal-documents",
};

export default async function SystemSettingsMovedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;

  const tab = typeof raw.tab === "string" ? raw.tab : undefined;
  if (tab && MOVED_TABS[tab]) redirect(MOVED_TABS[tab]);

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) for (const v of value) params.append(key, v);
  }
  const query = params.toString();
  redirect(
    `/portal/administration/organization-settings${query ? `?${query}` : ""}`,
  );
}
