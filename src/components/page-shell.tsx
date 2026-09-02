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
    <main className="app-shell px-6 py-8 sm:px-10">
      <div className={cn("mx-auto", maxWidth)}>{children}</div>
    </main>
  );
}
