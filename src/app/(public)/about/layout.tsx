import { PageShell } from "@/components/page-shell";

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageShell>{children}</PageShell>;
}
