import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const VOTE_OUTCOME_STYLES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  passed: "bg-secondary text-secondary-foreground",
  failed: "bg-destructive/10 text-destructive",
  tabled: "bg-[var(--purple-soft)] text-foreground",
};

function Pill({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function VoteOutcomeBadge({ outcome }: { outcome: string }) {
  return (
    <Pill
      className={
        VOTE_OUTCOME_STYLES[outcome] ?? "bg-muted text-muted-foreground"
      }
    >
      {outcome}
    </Pill>
  );
}
