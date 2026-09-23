import { requireVisiblePage } from "@/lib/page-visibility";

/**
 * A gate, and no PageShell: each page under /events invokes PageShell itself.
 * That used to be structural -- the layout carried an intercepted sheet for
 * /events/e/[id] (#847), which a shell here would have wrapped in a <main> of
 * its own -- and #1427 removed the sheet, so an event is always its own page.
 * The pages keep their shells so this layout stays a gate and nothing else.
 *
 * `requireVisiblePage` gates the listing and every event page alike, so hiding
 * the Events section 404s them rather than just dropping the link from the
 * nav (#586).
 */
export default async function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVisiblePage("events");
  return children;
}
