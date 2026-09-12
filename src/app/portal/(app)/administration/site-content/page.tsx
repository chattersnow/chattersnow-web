import { redirect } from "next/navigation";

/**
 * Site Content moved to the Website section in #944.
 *
 * The query string is carried over, not dropped: System Settings' Legal tab
 * deep-links here as `?page=legal`, and so does anything a user bookmarked
 * while editing one page of the site.
 *
 * A route rather than a `next.config.ts` redirect, for the reason given in
 * administration/access-management/page.tsx: the portal is served both as
 * `/portal/...` paths and prefix-free on a `portal.` host.
 */
export default async function SiteContentMovedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value)) for (const v of value) params.append(key, v);
  }
  const query = params.toString();
  redirect(`/portal/website${query ? `?${query}` : ""}`);
}
