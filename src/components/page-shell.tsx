import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageShell({
  children,
  maxWidth = "max-w-6xl",
}: {
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <main
      id="main-content"
      // Focusable only as the skip link's target, so focus actually lands
      // in the content rather than staying on the link.
      tabIndex={-1}
      className="app-shell px-6 py-8 outline-none sm:px-10"
    >
      <div className={cn("mx-auto", maxWidth)}>{children}</div>
    </main>
  );
}
