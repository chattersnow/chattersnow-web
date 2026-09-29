import { PageShell } from "@/components/page-shell";
import { requireVisiblePage } from "@/lib/page-visibility";

/**
 * The publications section (#1471). One gate for the index and every issue:
 * the slot is off until the tenant turns it on, and off whenever the
 * publications module is.
 */
export default async function PublicationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVisiblePage("publications");
  return <PageShell>{children}</PageShell>;
}
