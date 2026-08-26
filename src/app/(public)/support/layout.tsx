import { PageShell } from "@/components/page-shell";

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageShell>{children}</PageShell>;
}
