import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { RequirementStatus } from "./annual-requirement-form";

const REQUIREMENT_STATUS_STYLES: Record<RequirementStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/10 text-primary",
  done: "bg-secondary text-secondary-foreground",
};

const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
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
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function RequirementStatusBadge({
  status,
}: {
  status: RequirementStatus;
}) {
  return (
    <Pill className={REQUIREMENT_STATUS_STYLES[status]}>
      {REQUIREMENT_STATUS_LABELS[status]}
    </Pill>
  );
}
