import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-primary/10 text-primary",
};

const VISIBILITY_STYLES: Record<string, string> = {
  private: "bg-muted text-muted-foreground",
  public: "bg-secondary text-secondary-foreground",
};

function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Pill className={STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"}>
      {status}
    </Pill>
  );
}

export function VisibilityBadge({ visibility }: { visibility: string }) {
  return (
    <Pill className={VISIBILITY_STYLES[visibility] ?? "bg-muted text-muted-foreground"}>
      {visibility}
    </Pill>
  );
}
