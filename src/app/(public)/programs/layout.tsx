import { PageShell } from "@/components/page-shell";

export default function ProgramsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageShell>{children}</PageShell>;
}
