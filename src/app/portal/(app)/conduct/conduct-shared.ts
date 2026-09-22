import type { StatusTone } from "@/components/portal/status-badge";
import type {
  AcknowledgementState,
  ConductSeverity,
  ConductStatus,
} from "@/lib/conduct";

/**
 * Row shapes and tones shared by the queue, the case view and the components
 * under both. No server imports: the table and the badges are client
 * components.
 */

/**
 * What the queue lists, and deliberately without `summary`: the narrative is
 * the one column nothing needs in order to decide which case to open, and a
 * list that carries it hands every row's full text to a page that shows none
 * of it.
 */
export const CONDUCT_LIST_COLUMNS =
  "id, reference, received_on, channel, severity, status, acknowledged_on, decided_on, closed_on, subject_person_id, subject_description, subject:people!conduct_reports_subject_in_tenant(id, name)";

export type ConductListRow = {
  id: string;
  reference: string;
  received_on: string;
  channel: string;
  severity: ConductSeverity;
  status: ConductStatus;
  acknowledged_on: string | null;
  decided_on: string | null;
  closed_on: string | null;
  subject_person_id: string | null;
  subject_description: string | null;
  subject: { id: string; name: string } | null;
};

export type ConductCaseRow = ConductListRow & {
  reporter_kind: "named" | "anonymous";
  reporter_person_id: string | null;
  reporter_name: string | null;
  reporter_contact: string | null;
  event_id: string | null;
  event: { id: string; name: string } | null;
  reporter: { id: string; name: string } | null;
  context: string | null;
  summary: string;
  outcome: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
};

export const CONDUCT_CASE_COLUMNS = `${CONDUCT_LIST_COLUMNS}, reporter_kind, reporter_person_id, reporter_name, reporter_contact, event_id, context, summary, outcome, created_by, updated_by, created_at, reporter:people!conduct_reports_reporter_in_tenant(id, name), event:events!conduct_reports_event_in_tenant(id, name)`;

export type ConductReviewerRow = {
  id: string;
  user_id: string;
  stage: "review" | "appeal";
  assigned_on: string;
  assigned_by: string | null;
  recused_on: string | null;
  recusal_reason: string | null;
};

export type ConductActionRow = {
  id: string;
  kind: "interim" | "final";
  description: string;
  taken_on: string;
  lifted_on: string | null;
};

export type ConductAppealRow = {
  id: string;
  filed_on: string;
  grounds: string | null;
  decided_on: string | null;
  outcome: string | null;
};

/**
 * A case moves forward, so the tones climb rather than alternate: nothing has
 * happened, something is underway, something has been decided, it is over.
 * Nothing here is `danger` -- a conduct report is not a failure state, and
 * colouring one red would read as a judgement about the person it names.
 */
export const CONDUCT_STATUS_TONES: Record<ConductStatus, StatusTone> = {
  received: "neutral",
  acknowledged: "info",
  reviewing: "progress",
  decided: "success",
  closed: "neutral",
};

export const CONDUCT_SEVERITY_TONES: Record<ConductSeverity, StatusTone> = {
  minor: "neutral",
  moderate: "info",
  serious: "warning",
};

/**
 * The acknowledgement clock as a badge: what it says and how loudly.
 *
 * Returns null where there is nothing to say -- an organization with no
 * published commitment, or a report acknowledged inside one. A badge reading
 * "acknowledged on time" on every row would be noise that hid the two that are
 * not.
 */
export function acknowledgementBadge(
  state: AcknowledgementState,
): { label: string; tone: StatusTone } | null {
  switch (state.state) {
    case "unmeasured":
      return null;
    case "acknowledged":
      return state.late
        ? { label: "Acknowledged late", tone: "warning" }
        : null;
    case "due":
      return {
        label:
          state.daysLeft === 0
            ? "Acknowledge today"
            : `Acknowledge in ${state.daysLeft} ${state.daysLeft === 1 ? "day" : "days"}`,
        // Warning rather than danger: inside the window is not yet a failure,
        // and a queue that shouts at everything is a queue nobody reads.
        tone: state.daysLeft <= 1 ? "warning" : "progress",
      };
    case "overdue":
      return {
        label: `Acknowledgement ${state.daysLate} ${state.daysLate === 1 ? "day" : "days"} late`,
        tone: "danger",
      };
  }
}

/** How a person is named in the queue, with nothing invented for an absence. */
export function subjectLabel(row: {
  subject: { name: string } | null;
  subject_description: string | null;
}): string {
  return row.subject?.name ?? row.subject_description ?? "Not named";
}
