import type { ReactNode } from "react";

type HowToSectionProps = {
  heading: string;
  children: ReactNode;
};

/** A single labeled block of help content (e.g. "Steps", "Who can do this"). */
export function HowToSection({ heading, children }: HowToSectionProps) {
  return (
    <section>
      <h3 className="text-foreground text-xs font-semibold uppercase tracking-[0.1em]">
        {heading}
      </h3>
      <div className="app-muted mt-2 leading-relaxed">{children}</div>
    </section>
  );
}
