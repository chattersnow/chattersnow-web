import { PageShell } from "@/components/page-shell";

// No gate of any kind, and deliberately so. Unlike the marketing sections the
// privacy policy has no visibility slot, and unlike the other two legal
// documents it has no publication state either (#859): it has to stay
// reachable whenever the site is collecting personal data, and since #858 there
// is always something honest to serve -- this tenant's own document, or the
// platform's neutral default. See src/lib/legal-documents.ts.
export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Deliberately the default max-w-6xl, same as every other public section, so
  // the page's left edge lines up with the header and footer. The policy text
  // is held to a readable measure inside page.tsx instead -- the same split
  // /about/story and /about/mission use -- rather than by narrowing the shell,
  // which centered the whole page and made it look like a different site.
  return <PageShell>{children}</PageShell>;
}
