import { PageShell } from "@/components/page-shell";
import { requireVisiblePage } from "@/lib/page-visibility";

export default async function GearsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVisiblePage("gears");
  return <PageShell>{children}</PageShell>;
}
