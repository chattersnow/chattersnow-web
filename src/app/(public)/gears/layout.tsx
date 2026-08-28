import { PageShell } from "@/components/page-shell";

export default function GearsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageShell>{children}</PageShell>;
}
