import { PageShell } from "@/components/page-shell";
import { requireLegalDocumentInForce } from "@/lib/legal-publication";

// Not a page-visibility slot, for the same reason as the terms and the code of
// conduct: this is a decision about a document, not about a section of the site
// (#859). It is served once this tenant has put it in force, and 404s until
// then.
//
// That is the closest call in the registry (#1368), because the reader who most
// needs a route for reporting a barrier is the least able to go hunting for one.
// It still goes the same way: a conformance claim published under an
// organization's name covers that organization's own alt text, its uploaded
// images, the documents it links and the venues it meets in, and none of that is
// the platform's to assert. An accessibility statement nobody here has read is
// the failure this gate exists to prevent, and overclaiming conformance to a
// disabled reader is not a neutral error.
//
// Default max-w-6xl, like every other public section, with the text held to a
// readable measure inside page.tsx.
export default async function AccessibilityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireLegalDocumentInForce("accessibility");

  return <PageShell>{children}</PageShell>;
}
