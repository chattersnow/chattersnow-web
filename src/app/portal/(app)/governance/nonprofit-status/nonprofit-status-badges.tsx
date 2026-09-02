import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MilestoneStatus } from "./nonprofit-status-form";

const DUE_SOON_THRESHOLD_DAYS = 2;

// due_date is a Postgres `date` (YYYY-MM-DD); diff the calendar dates
// directly (as UTC midnights) rather than parsing with the viewer's local
// timezone, so "due in 2 days" doesn't shift with the viewer's offset.
function daysUntilDue(dueDate: string, today: Date): number {
  const [year, month, day] = dueDate.split("-").map(Number);
  const dueUtc = Date.UTC(year, month - 1, day);
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Math.round((dueUtc - todayUtc) / (24 * 60 * 60 * 1000));
}

const MILESTONE_STATUS_STYLES: Record<MilestoneStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/10 text-primary",
  done: "bg-secondary text-secondary-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

const MILESTONE_STATUS_ICONS: Record<MilestoneStatus, LucideIcon> = {
  not_started: Circle,
  in_progress: CircleDot,
  done: CheckCircle2,
  cancelled: XCircle,
};

const MILESTONE_STATUS_ICON_STYLES: Record<MilestoneStatus, string> = {
  not_started: "text-muted-foreground",
  in_progress: "text-primary",
  done: "text-secondary-foreground",
  cancelled: "text-destructive",
};

export function MilestoneStatusIcon({
  status,
  className,
}: {
  status: MilestoneStatus;
  className?: string;
}) {
  const Icon = MILESTONE_STATUS_ICONS[status];
  return (
    <Icon
      aria-hidden
      className={cn(
        "size-3.5 shrink-0",
        MILESTONE_STATUS_ICON_STYLES[status],
        className,
      )}
    />
  );
}

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

export function MilestoneStatusBadge({ status }: { status: MilestoneStatus }) {
  return (
    <Pill className={cn("gap-1", MILESTONE_STATUS_STYLES[status])}>
      <MilestoneStatusIcon status={status} />
      {MILESTONE_STATUS_LABELS[status]}
    </Pill>
  );
}

/**
 * Flags an active (not done/cancelled) milestone whose due date has passed
 * or is within `DUE_SOON_THRESHOLD_DAYS` days, so at-risk milestones stand
 * out in the checklist without having to read every due date.
 */
export function MilestoneDueFlag({
  dueDate,
  status,
  now = new Date(),
}: {
  dueDate: string | null;
  status: MilestoneStatus;
  now?: Date;
}) {
  if (!dueDate || status === "done" || status === "cancelled") return null;

  const days = daysUntilDue(dueDate, now);
  if (days > DUE_SOON_THRESHOLD_DAYS) return null;

  if (days < 0) {
    const overdueDays = Math.abs(days);
    return (
      <span
        title="This milestone's due date has passed"
        className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
      >
        <AlertTriangle className="size-3" />
        {overdueDays} day{overdueDays === 1 ? "" : "s"} overdue
      </span>
    );
  }

  return (
    <span
      title="This milestone is due soon"
      className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
    >
      <Clock className="size-3" />
      {days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`}
    </span>
  );
}

export function isMilestoneDueSoonOrOverdue(
  milestone: { due_date: string | null; status: MilestoneStatus },
  now: Date = new Date(),
): boolean {
  if (
    !milestone.due_date ||
    milestone.status === "done" ||
    milestone.status === "cancelled"
  ) {
    return false;
  }
  return daysUntilDue(milestone.due_date, now) <= DUE_SOON_THRESHOLD_DAYS;
}
