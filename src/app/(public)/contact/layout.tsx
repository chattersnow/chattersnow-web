import { PageShell } from "@/components/page-shell";
import { requireVisiblePage } from "@/lib/page-visibility";

export default async function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVisiblePage("contact");
  return <PageShell>{children}</PageShell>;
}
