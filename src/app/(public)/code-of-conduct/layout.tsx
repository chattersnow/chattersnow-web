import { PageShell } from "@/components/page-shell";

// No visibility slot, for the same reason as the privacy policy and the terms:
// the code of conduct governs every event and every space Chatter runs, so it
// has to stay reachable for as long as those are running, and is not something
// the board can hide from Administration > System Settings.
//
// Default max-w-6xl, like every other public section, with the text held to a
// readable measure inside page.tsx.
export default function CodeOfConductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageShell>{children}</PageShell>;
}
