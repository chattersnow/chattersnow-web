import {
  humanizeStatus,
  StatusBadge as StatusPill,
  type StatusTone,
} from "@/components/portal/status-badge";

export type EventLeadPerson = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

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
  auto_assign_discount_codes: boolean;
  budget_amount: number | string | null;
  event_lead_id: string | null;
  event_lead: EventLeadPerson | null;
  report_status: string;
  report_summary: string | null;
  lessons_learned: string | null;
  feedback_notes: string | null;
  content_notes: string | null;
  report_submitted_at: string | null;
  report_submitted_by: string | null;
  program_id: string | null;
  flier_url: string | null;
};

const STATUS_STYLES: Record<string, StatusTone> = {
  draft: "neutral",
  published: "progress",
  completed: "success",
  cancelled: "danger",
  archived: "neutral",
};

const VISIBILITY_STYLES: Record<string, StatusTone> = {
  private: "neutral",
  public: "info",
};

const REPORT_STATUS_STYLES: Record<string, StatusTone> = {
  not_started: "neutral",
  in_progress: "progress",
  submitted: "success",
};

const REPORT_STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <StatusPill tone={STATUS_STYLES[status] ?? "neutral"}>{status}</StatusPill>
  );
}

export function VisibilityBadge({ visibility }: { visibility: string }) {
  return (
    <StatusPill tone={VISIBILITY_STYLES[visibility] ?? "neutral"}>
      {humanizeStatus(visibility)}
    </StatusPill>
  );
}

export function ReportStatusBadge({ status }: { status: string }) {
  return (
    <StatusPill tone={REPORT_STATUS_STYLES[status] ?? "neutral"}>
      {REPORT_STATUS_LABELS[status] ?? status}
    </StatusPill>
  );
}

export type PhaseStatus = "not_started" | "in_progress" | "done";

const PHASE_STATUS_STYLES: Record<PhaseStatus, StatusTone> = {
  not_started: "neutral",
  in_progress: "progress",
  done: "success",
};

const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

export function PhaseStatusBadge({ status }: { status: PhaseStatus }) {
  return (
    <StatusPill tone={PHASE_STATUS_STYLES[status]}>
      {PHASE_STATUS_LABELS[status]}
    </StatusPill>
  );
}

const SEVERITY_STYLES: Record<string, StatusTone> = {
  minor: "neutral",
  moderate: "progress",
  serious: "danger",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <StatusPill tone={SEVERITY_STYLES[severity] ?? "neutral"}>
      {humanizeStatus(severity)}
    </StatusPill>
  );
}
