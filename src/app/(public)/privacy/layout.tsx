import { PageShell } from "@/components/page-shell";

// No visibility slot: unlike the marketing sections, the privacy policy has to
// stay reachable whenever the site is collecting personal data, so it is not
// something the board can hide from Administration > System Settings.
export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageShell maxWidth="max-w-3xl">{children}</PageShell>;
}
