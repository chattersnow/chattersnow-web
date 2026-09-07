import { PageShell } from "@/components/page-shell";
import { notFound } from "next/navigation";
import { LEGAL_PAGES_PUBLISHED } from "@/lib/legal-pages";

// No visibility slot, for the same reason as the privacy policy: the terms
// govern the submissions the public forms take, so they have to stay reachable
// for as long as those forms are up, and are not something the board can hide
// from Administration > System Settings.
//
// Default max-w-6xl, like every other public section, with the policy text
// held to a readable measure inside page.tsx.
export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Awaiting the board's legal review; see src/lib/legal-pages.ts.
  if (!LEGAL_PAGES_PUBLISHED) notFound();

  return <PageShell>{children}</PageShell>;
}
