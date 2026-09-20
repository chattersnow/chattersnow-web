import { PageShell } from "@/components/page-shell";
import { requireVisiblePage } from "@/lib/page-visibility";

/** The business front door's gate (#1328). See `(public)/nonprofits/layout.tsx`. */
export default async function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVisiblePage("audiences");

  return <PageShell>{children}</PageShell>;
}
