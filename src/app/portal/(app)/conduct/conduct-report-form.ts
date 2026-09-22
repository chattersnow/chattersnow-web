import type { ParseResult } from "@/lib/forms";
import {
  isConductActionKind,
  isConductChannel,
  isConductReviewStage,
  isConductSeverity,
  type ConductActionKind,
  type ConductChannel,
  type ConductReviewStage,
  type ConductSeverity,
} from "@/lib/conduct";

/**
 * The parsers behind every write in the conduct area (#687).
 *
 * Pure, and the only place a form value becomes a column value, which is what
 * lets the tests below post the shapes a browser never would. Two of them carry
 * a guarantee rather than a validation, and both are restated in the migration:
 *
 *   * an anonymous report DROPS a name, a contact and a person link rather than
 *     refusing them, so an intake worker who fills in a name and then ticks
 *     "anonymous" cannot leave the reporter identified;
 *   * nothing here accepts a status. The case's state moves through
 *     `parseConductProgressForm` one named step at a time, so "closed with no
 *     closing date" is not a shape any form can produce.
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function day(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

function optionalId(formData: FormData, field: string): string | null {
  return text(formData, field) || null;
}

/** A required "YYYY-MM-DD" that is a real day and is not in the future. */
function pastOrTodayDate(
  value: string,
  field: string,
  label: string,
  today: string,
): ParseResult<string> {
  if (!value) return { error: `${label} is required.`, field };
  if (!ISO_DAY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    return { error: `${label} is not a date.`, field };
  }
  // A date in the future is almost always a typo in the year, and it would
  // start every clock on the case from the wrong day.
  if (value > today)
    return { error: `${label} cannot be in the future.`, field };
  return { data: value };
}

export type ConductReportFormData = {
  received_on: string;
  channel: ConductChannel;
  reporter_kind: "named" | "anonymous";
  reporter_person_id: string | null;
  reporter_name: string | null;
  reporter_contact: string | null;
  subject_person_id: string | null;
  subject_description: string | null;
  event_id: string | null;
  context: string | null;
  summary: string;
  severity: ConductSeverity;
};

export function parseConductReportForm(
  formData: FormData,
  today: string,
): ParseResult<ConductReportFormData> {
  const received = pastOrTodayDate(
    day(formData, "receivedOn"),
    "receivedOn",
    "The date it was received",
    today,
  );
  if ("error" in received) return received;

  const channel = text(formData, "channel");
  if (!isConductChannel(channel)) {
    return { error: "Choose how the report reached you.", field: "channel" };
  }

  const severity = text(formData, "severity");
  if (!isConductSeverity(severity)) {
    return { error: "Choose a severity.", field: "severity" };
  }

  const summary = text(formData, "summary");
  if (!summary) {
    return { error: "Say what was reported.", field: "summary" };
  }

  const anonymous = text(formData, "reporterKind") === "anonymous";

  return {
    data: {
      received_on: received.data,
      channel,
      reporter_kind: anonymous ? "anonymous" : "named",
      // Dropped rather than rejected. Somebody who types a name and then ticks
      // "anonymous" has changed their mind about the promise made to the
      // reporter, and the form must follow rather than argue.
      reporter_person_id: anonymous
        ? null
        : optionalId(formData, "reporterPersonId"),
      reporter_name: anonymous ? null : text(formData, "reporterName") || null,
      reporter_contact: anonymous
        ? null
        : text(formData, "reporterContact") || null,
      subject_person_id: optionalId(formData, "subjectPersonId"),
      subject_description: text(formData, "subjectDescription") || null,
      event_id: optionalId(formData, "eventId"),
      context: text(formData, "context") || null,
      summary,
      severity,
    },
  };
}

/**
 * One named step of the case's own progress.
 *
 * A step rather than a status, because every state in this schema is a state
 * plus a date, and letting a form set the status alone is how a report ends up
 * closed with no closing date or decided with no decision.
 */
export type ConductProgressStep =
  | { step: "acknowledge"; acknowledged_on: string }
  | { step: "review" }
  | { step: "decide"; decided_on: string; outcome: string }
  | { step: "close"; closed_on: string }
  | { step: "reopen" };

export function parseConductProgressForm(
  formData: FormData,
  today: string,
): ParseResult<ConductProgressStep> {
  const step = text(formData, "step");

  switch (step) {
    case "acknowledge": {
      const date = pastOrTodayDate(
        day(formData, "acknowledgedOn"),
        "acknowledgedOn",
        "The date you acknowledged it",
        today,
      );
      if ("error" in date) return date;
      return { data: { step: "acknowledge", acknowledged_on: date.data } };
    }
    case "review":
      return { data: { step: "review" } };
    case "decide": {
      const date = pastOrTodayDate(
        day(formData, "decidedOn"),
        "decidedOn",
        "The date of the decision",
        today,
      );
      if ("error" in date) return date;
      const outcome = text(formData, "outcome");
      if (!outcome) {
        return { error: "Say what was decided.", field: "outcome" };
      }
      return { data: { step: "decide", decided_on: date.data, outcome } };
    }
    case "close": {
      const date = pastOrTodayDate(
        day(formData, "closedOn"),
        "closedOn",
        "The date it was closed",
        today,
      );
      if ("error" in date) return date;
      return { data: { step: "close", closed_on: date.data } };
    }
    case "reopen":
      return { data: { step: "reopen" } };
    default:
      return { error: "Unknown step." };
  }
}

export type ConductReviewerFormData = {
  user_id: string;
  stage: ConductReviewStage;
};

export function parseConductReviewerForm(
  formData: FormData,
): ParseResult<ConductReviewerFormData> {
  const userId = text(formData, "userId");
  if (!userId) return { error: "Choose somebody to assign.", field: "userId" };

  const stage = text(formData, "stage");
  if (!isConductReviewStage(stage)) {
    return { error: "Choose the review or the appeal.", field: "stage" };
  }

  return { data: { user_id: userId, stage } };
}

/**
 * A recusal reason is required, and that is the whole point of recording a
 * recusal at all: "somebody stepped back" answers none of the questions asked
 * afterwards.
 */
export function parseConductRecusalForm(
  formData: FormData,
): ParseResult<{ reason: string }> {
  const reason = text(formData, "reason");
  if (!reason) {
    return { error: "Say why you are stepping back.", field: "reason" };
  }
  return { data: { reason } };
}

export type ConductActionFormData = {
  kind: ConductActionKind;
  description: string;
  taken_on: string;
};

export function parseConductActionForm(
  formData: FormData,
  today: string,
): ParseResult<ConductActionFormData> {
  const kind = text(formData, "kind");
  if (!isConductActionKind(kind)) {
    return { error: "Choose whether this is interim or final.", field: "kind" };
  }

  const description = text(formData, "description");
  if (!description) {
    return { error: "Say what was done.", field: "description" };
  }

  const taken = pastOrTodayDate(
    day(formData, "takenOn"),
    "takenOn",
    "The date it was taken",
    today,
  );
  if ("error" in taken) return taken;

  return { data: { kind, description, taken_on: taken.data } };
}

export function parseConductLiftForm(
  formData: FormData,
  today: string,
): ParseResult<{ lifted_on: string }> {
  const lifted = pastOrTodayDate(
    day(formData, "liftedOn"),
    "liftedOn",
    "The date it was lifted",
    today,
  );
  if ("error" in lifted) return lifted;
  return { data: { lifted_on: lifted.data } };
}

export type ConductAppealFormData = {
  filed_on: string;
  grounds: string | null;
};

export function parseConductAppealForm(
  formData: FormData,
  today: string,
): ParseResult<ConductAppealFormData> {
  const filed = pastOrTodayDate(
    day(formData, "filedOn"),
    "filedOn",
    "The date it was filed",
    today,
  );
  if ("error" in filed) return filed;
  return {
    data: { filed_on: filed.data, grounds: text(formData, "grounds") || null },
  };
}

export function parseConductAppealDecisionForm(
  formData: FormData,
  today: string,
): ParseResult<{ decided_on: string; outcome: string }> {
  const decided = pastOrTodayDate(
    day(formData, "decidedOn"),
    "decidedOn",
    "The date of the decision",
    today,
  );
  if ("error" in decided) return decided;

  const outcome = text(formData, "outcome");
  if (!outcome) return { error: "Say what was decided.", field: "outcome" };

  return { data: { decided_on: decided.data, outcome } };
}
