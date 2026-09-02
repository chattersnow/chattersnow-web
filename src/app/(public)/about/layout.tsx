import { PageShell } from "@/components/page-shell";
import { requireVisiblePage } from "@/lib/page-visibility";

export default async function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVisiblePage("about");
  return <PageShell>{children}</PageShell>;
}
