import { PageShell } from "@/components/page-shell";
import { requireLegalDocumentInForce } from "@/lib/legal-publication";

// Not a page-visibility slot: hiding a section of the marketing site and
// adopting a legal document are different decisions, and only the second one
// applies here (#859). The terms are served once this tenant has put them in
// force, and 404 until then -- an organization that has adopted no terms should
// not have borrowed ones served under its name.
//
// Default max-w-6xl, like every other public section, with the text held to a
// readable measure inside page.tsx.
export default async function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireLegalDocumentInForce("terms");

  return <PageShell>{children}</PageShell>;
}
