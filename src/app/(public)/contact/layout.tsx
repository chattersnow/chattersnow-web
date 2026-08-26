import { PageShell } from "@/components/page-shell";

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PageShell>{children}</PageShell>;
}
