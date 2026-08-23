import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MeetingRow = {
  id: string;
  meeting_date: string;
  meeting_type: string;
  status: string;
  location: string | null;
  notes: string | null;
};

const TYPE_STYLES: Record<string, string> = {
  board: "bg-primary/10 text-primary",
  committee: "bg-secondary text-secondary-foreground",
  annual: "bg-[var(--purple-soft)] text-foreground",
  other: "bg-muted text-muted-foreground",
};

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-primary/10 text-primary",
  completed: "bg-secondary text-secondary-foreground",
  cancelled: "bg-destructive/10 text-destructive",
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

export function MeetingTypeBadge({ type }: { type: string }) {
  return <Pill className={TYPE_STYLES[type] ?? "bg-muted text-muted-foreground"}>{type}</Pill>;
}

export function MeetingStatusBadge({ status }: { status: string }) {
  return <Pill className={STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"}>{status}</Pill>;
}
