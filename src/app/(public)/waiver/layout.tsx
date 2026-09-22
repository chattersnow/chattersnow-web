import { PageShell } from "@/components/page-shell";
import { requireLegalDocumentInForce } from "@/lib/legal-publication";

// Not a page-visibility slot, for the same reason as the terms and the code of
// conduct: this is a decision about a document, not about a section of the site
// (#859).
//
// The difference here is what "not in force" covers (#686). The other two fall
// back to the platform's neutral text once adopted; this one has none, so the
// route answers to two conditions rather than one -- the tenant has put a
// waiver in force, *and* it has published the words. The second is checked in
// `LegalDocumentPage`, which is the only place that knows whether the slot is
// written.
//
// Default max-w-6xl, like every other public section, with the text held to a
// readable measure inside page.tsx.
export default async function WaiverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireLegalDocumentInForce("waiver");

  return <PageShell>{children}</PageShell>;
}
