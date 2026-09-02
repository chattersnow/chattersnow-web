import { PageShell } from "@/components/page-shell";
import { requireVisiblePage } from "@/lib/page-visibility";

export default async function GetInvolvedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVisiblePage("get-involved");
  return <PageShell>{children}</PageShell>;
}
