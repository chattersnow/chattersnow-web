import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export function LearnSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="space-y-4 scroll-mt-24">
      <div>
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          {title}
        </h2>
        <p className="app-muted mt-2 max-w-3xl text-sm leading-relaxed sm:text-base">
          {description}
        </p>
      </div>
      <Card>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </section>
  );
}

export function LearnDisclaimer({ children }: { children: ReactNode }) {
  return <p className="app-muted text-xs leading-relaxed">{children}</p>;
}
