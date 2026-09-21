import { PageShell } from "@/components/page-shell";
import { requireVisiblePage } from "@/lib/page-visibility";

/**
 * The module tour's gate (#1329). Its own slot rather than the `audiences` one
 * next door: the tour is publishable when its screenshots exist (#1332) and the
 * audience paths are publishable now, and one switch would have held whichever
 * was ready behind whichever was not.
 */
export default async function ModulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVisiblePage("modules");

  return <PageShell>{children}</PageShell>;
}
