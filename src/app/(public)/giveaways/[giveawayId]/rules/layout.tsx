import { PageShell } from "@/components/page-shell";

// No visibility slot and no adoption switch (#1322). A promotion's official
// rules are served because somebody published a version of them for that
// promotion, and 404 until then -- which is the same principle #859 applies to
// the legal documents, applied one promotion at a time rather than once for
// the whole site. There is nothing to hide here that publishing does not
// already decide.
//
// Default max-w-6xl, like every other public section, with the text held to a
// readable measure by LegalPageShell inside page.tsx.
export default function GiveawayRulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageShell>{children}</PageShell>;
}
