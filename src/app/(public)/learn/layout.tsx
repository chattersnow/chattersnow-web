import { PageShell } from "@/components/page-shell";
import { EducationalDisclaimer } from "@/components/educational-disclaimer";

export default function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PageShell>
      <div className="space-y-12">
        {children}
        <EducationalDisclaimer />
      </div>
    </PageShell>
  );
}
