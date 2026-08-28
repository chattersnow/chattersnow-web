import type { ReactNode } from "react";
import { AlertTriangle, MessageSquareWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CONTENT_STATUSES,
  type OverdueStage,
} from "./content-opportunity-shared";

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

const OVERDUE_STAGE_LABELS: Record<OverdueStage, string> = {
  draft: "Draft overdue",
  review: "Review overdue",
  publish: "Publish overdue",
};

const OVERDUE_STAGE_TITLES: Record<OverdueStage, string> = {
  draft: "The draft due date for this content opportunity has passed",
  review: "The review due date for this content opportunity has passed",
  publish: "The publish due date for this content opportunity has passed",
};

export function ContentOverdueFlag({ stage }: { stage: OverdueStage }) {
  return (
    <span
      title={OVERDUE_STAGE_TITLES[stage]}
      className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
    >
      <AlertTriangle className="size-3" />
      {OVERDUE_STAGE_LABELS[stage]}
    </span>
  );
}

export function ChangesRequestedFlag() {
  return (
    <span
      title="The reviewer requested changes on this content opportunity"
      className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
    >
      <MessageSquareWarning className="size-3" />
      Changes requested
    </span>
  );
}
