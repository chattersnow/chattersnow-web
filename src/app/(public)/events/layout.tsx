import { requireVisiblePage } from "@/lib/page-visibility";

/**
 * Gate only -- no PageShell. Unlike the other public sections, each page under
 * /events invokes PageShell itself, because they do not share one column
 * width: /events/[id] wants max-w-3xl and the rest want the default. Wrapping
 * here would both nest a second <main> and force a single width on all of
 * them. This layout exists purely so hiding the Events section makes its URLs
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
