import { requireConstituentArea } from "@/lib/constituent/guard";

/**
 * The constituent area's own gate (#1161).
 *
 * Only the module is checked here, not the session: `/my/sign-in` is a child
 * of this layout and has to be reachable signed out, so a redirect at this
 * level would bounce a visitor into the page that was trying to serve them.
 * Each page below decides for itself, through `requireConstituentSession()`.
 *
 * This nests inside the public layout, so the area keeps the organization's
 * own header, footer and branding. That is the point: this is the tenant's
 * website, not a second application -- and not the portal, which requires a
 * role that nobody here has.
 *
 * Gate and slot, with no `PageShell` -- the precedent `(public)/events/layout`
 * sets. Until #1218 the reason was that the five routes below did not share a
 * column width; they all sit in the one public column now, and what keeps the
 * shell on the pages is `loading.tsx` and `error.tsx`. Those render in place
 * of the page but inside this layout, so a shell here would wrap a second one
 * and nest two `<main>` elements on every fallback. Each page, each loading
 * file and the error boundary invokes `PageShell` itself, which is also what
 * gives it the `<main id="main-content">` the public layout's skip link aims
 * at. Until #1179 none of them did, so the area shipped no main landmark at
 * all.
 */
export default async function MyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireConstituentArea();
  return children;
}
