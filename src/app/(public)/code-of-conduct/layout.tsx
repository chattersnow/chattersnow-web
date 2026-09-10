import { PageShell } from "@/components/page-shell";
import { requireLegalDocumentInForce } from "@/lib/legal-publication";

// Not a page-visibility slot, for the same reason as the terms: this is a
// decision about a document, not about a section of the site (#859). It is
// served once this tenant has put it in force, and 404s until then -- a code of
// conduct nobody has adopted is worse than none, because it tells someone there
// is a process behind it.
//
// Default max-w-6xl, like every other public section, with the text held to a
// readable measure inside page.tsx.
export default async function CodeOfConductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireLegalDocumentInForce("code_of_conduct");

  return <PageShell>{children}</PageShell>;
}
