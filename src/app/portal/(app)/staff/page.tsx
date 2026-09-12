import { redirect } from "next/navigation";

/**
 * Staff became a segment of the People directory in #957.
 *
 * #622 collapsed these into sub-items of People in the sidebar and left the
 * routes where they were, so the section advertised eight destinations and
 * owned four of them. They are one directory seen through eight filters, and
 * they now live at /portal/people/*.
 *
 * The query string is carried over: a search, a sort or a page number means
 * the same thing at the new address, and these URLs are bookmarked.
 *
 * A route rather than a `next.config.ts` redirect, for the reason given in
 * administration/access-management/page.tsx: the portal is served both as
 * `/portal/...` paths and prefix-free on a `portal.` host.
 *
 * Deliberately unguarded, like the other moved-route stubs: it renders
 * nothing and reads nothing, and people/layout.tsx refuses anyone without
 * `people:view` on the way in.
 */
export default async function StaffMovedPage({
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
  redirect(`/portal/people/staff${query ? `?${query}` : ""}`);
}
