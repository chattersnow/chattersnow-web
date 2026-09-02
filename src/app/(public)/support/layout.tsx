import { PageShell } from "@/components/page-shell";
import { requireVisiblePage } from "@/lib/page-visibility";

export default async function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVisiblePage("support");

  return <PageShell>{children}</PageShell>;
}
