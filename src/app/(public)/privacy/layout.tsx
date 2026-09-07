import { PageShell } from "@/components/page-shell";
import { notFound } from "next/navigation";
import { LEGAL_PAGES_PUBLISHED } from "@/lib/legal-pages";

// No visibility slot: unlike the marketing sections, the privacy policy has to
// stay reachable whenever the site is collecting personal data, so it is not
// something the board can hide from Administration > System Settings.
export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Awaiting the board's legal review; see src/lib/legal-pages.ts.
  if (!LEGAL_PAGES_PUBLISHED) notFound();

  // Deliberately the default max-w-6xl, same as every other public section, so
  // the page's left edge lines up with the header and footer. The policy text
  // is held to a readable measure inside page.tsx instead -- the same split
  // /about/story and /about/mission use -- rather than by narrowing the shell,
  // which centered the whole page and made it look like a different site.
  return <PageShell>{children}</PageShell>;
}
