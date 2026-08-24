import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CONTENT_STATUSES } from "./content-opportunity-shared";

const CONTENT_STATUS_STYLES: Record<string, string> = {
  not_planned: "bg-muted text-muted-foreground",
  idea: "bg-muted text-muted-foreground",
  draft: "bg-primary/10 text-primary",
  in_review: "bg-primary/10 text-primary",
  changes_requested: "bg-destructive/10 text-destructive",
  approved: "bg-secondary text-secondary-foreground",
  scheduled: "bg-secondary text-secondary-foreground",
  published: "bg-secondary text-secondary-foreground",
  skipped: "bg-muted text-muted-foreground",
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

export function ContentStatusBadge({ status }: { status: string }) {
  const label =
    CONTENT_STATUSES.find((option) => option.value === status)?.label ?? status;
  return (
    <Pill
      className={
        CONTENT_STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"
      }
    >
      {label}
    </Pill>
  );
}
