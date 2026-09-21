import { PageShell } from "@/components/page-shell";
import { requireVisiblePage } from "@/lib/page-visibility";

/**
 * The nonprofit front door's gate (#1328). Its twin is
 * `(public)/business/layout.tsx`: one `audiences` slot governs both, and each
 * route calls the gate itself because they are siblings with no shared layout
 * to put it in.
 */
export default async function NonprofitsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVisiblePage("audiences");

  return <PageShell>{children}</PageShell>;
}
