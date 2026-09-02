import { requireVisiblePage } from "@/lib/page-visibility";

/**
 * Gate only -- no PageShell. Unlike the other public sections, the pages under
 * /events render their own <main>, so wrapping them here would nest a second
 * one. This layout exists purely so hiding the Events section makes its URLs
 * 404 instead of just dropping the link from the nav.
 */
export default async function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVisiblePage("events");
  return children;
}
