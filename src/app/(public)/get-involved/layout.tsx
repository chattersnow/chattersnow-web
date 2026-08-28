import { PageShell } from "@/components/page-shell";

export default function GetInvolvedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageShell>{children}</PageShell>;
}
