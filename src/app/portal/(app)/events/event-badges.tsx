import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EventRow = {
  id: string;
  name: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  visibility: string;
  status: string;
  attendance_count: number | null;
  attendance_notes: string | null;
  description: string | null;
  event_type: string | null;
  venue: string | null;
  capacity: number | null;
  registration_enabled: boolean;
  registration_deadline: string | null;
  budget_amount: number | string | null;
  event_lead_id: string | null;
  report_status: string;
  report_summary: string | null;
  lessons_learned: string | null;
  feedback_notes: string | null;
  content_notes: string | null;
  report_submitted_at: string | null;
  report_submitted_by: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-primary/10 text-primary",
  completed: "bg-secondary text-secondary-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  archived: "bg-muted text-muted-foreground",
};

const VISIBILITY_STYLES: Record<string, string> = {
  private: "bg-muted text-muted-foreground",
  public: "bg-secondary text-secondary-foreground",
};

const REPORT_STATUS_STYLES: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/10 text-primary",
  submitted: "bg-secondary text-secondary-foreground",
};

const REPORT_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
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

export function ReportStatusBadge({ status }: { status: string }) {
  return (
    <Pill className={REPORT_STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"}>
      {REPORT_STATUS_LABELS[status] ?? status}
    </Pill>
  );
}

export type PhaseStatus = "not_started" | "in_progress" | "done";

const PHASE_STATUS_STYLES: Record<PhaseStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/10 text-primary",
  done: "bg-secondary text-secondary-foreground",
};

const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

export function PhaseStatusBadge({ status }: { status: PhaseStatus }) {
  return <Pill className={PHASE_STATUS_STYLES[status]}>{PHASE_STATUS_LABELS[status]}</Pill>;
}

const SEVERITY_STYLES: Record<string, string> = {
  minor: "bg-muted text-muted-foreground",
  moderate: "bg-primary/10 text-primary",
  serious: "bg-destructive/10 text-destructive",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return <Pill className={SEVERITY_STYLES[severity] ?? "bg-muted text-muted-foreground"}>{severity}</Pill>;
}
