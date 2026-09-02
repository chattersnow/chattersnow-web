import { PageShell } from "@/components/page-shell";
import { requireVisiblePage } from "@/lib/page-visibility";

export default async function ProgramsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVisiblePage("programs");

  return <PageShell>{children}</PageShell>;
}
