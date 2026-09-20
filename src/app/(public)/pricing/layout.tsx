import { PageShell } from "@/components/page-shell";
import { requireVisiblePage } from "@/lib/page-visibility";

/**
 * The price list's gate (#1330), and the one gate on this site that is expected
 * to stay shut on the very site the page was written for. The page ships
 * complete; the numbers on it are a decision (#998, open question 4), and a
 * price published before somebody agreed to it is quoted back at you.
 */
export default async function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVisiblePage("pricing");

  return <PageShell>{children}</PageShell>;
}
