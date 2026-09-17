import { requireVisiblePage } from "@/lib/page-visibility";

/**
 * Gate and slot -- no PageShell. Unlike the other public sections, each page
 * under /events invokes PageShell itself. Until #1218 that was because they
 * did not share one column width; they all sit in the one public column now,
 * and what keeps the shell on the pages is the `modal` slot below. A shell
 * here would wrap the intercepted sheet in a <main> of its own, on top of the
 * one the page behind it already renders.
 *
 * The `modal` slot is the intercepted /events/e/[id] (#847). Keeping it on this
 * layout rather than the (public) one is what scopes interception to the
 * listing: a card followed from the home page is a full navigation to the
 * event's page, not a sheet over home.
 *
 * `requireVisiblePage` gates both, so hiding the Events section 404s the
 * listing, the event pages and the sheet alike rather than just dropping the
 * link from the nav (#586).
 */
export default async function EventsLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  await requireVisiblePage("events");
  return (
    <>
      {children}
      {modal}
    </>
  );
}
