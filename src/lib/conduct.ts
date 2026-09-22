import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, utcDateFromIsoDay } from "@/lib/time";

/**
 * Conduct report vocabulary and the clocks measured against it (#687).
 *
 * The clocks are the reason this module exists, and the rule they follow is
 * worth stating once at the top, because every function below is shaped by it:
 *
 * > **The platform owns no deadline.** Five days to acknowledge, fourteen to
 * > appeal and two reviewers to decide are the first tenant's own published
 * > code of conduct, not this software's behaviour. Another organization
 * > adopting one sets its own numbers or states none, and a business tenant may
 * > have no board at all to do a two-reviewer review.
 *
 * So `ConductProcess` is four nullable fields, every one of them absent until
 * an organization sets it, and every helper here answers `"none"` rather than
 * inventing a default. A tenant that has configured nothing sees a case tracker
 * with no deadline anywhere on it. That is the correct rendering, not a
 * degraded one: a report shown as three days late against a deadline nobody
 * agreed to is a failure the software made up.
 *
 * No server-only imports, on purpose: the case view renders these states inside
 * client components, the same constraint `fiscal-year.ts` documents at length.
 * `getConductProcess` takes a client rather than reaching for one.
 */

export const CONDUCT_CHANNELS = [
  { value: "email", label: "Email" },
  { value: "in_person", label: "In person" },
  { value: "event", label: "At an event" },
  { value: "phone", label: "Phone" },
  { value: "post", label: "Post" },
  { value: "other", label: "Other" },
] as const;

export type ConductChannel = (typeof CONDUCT_CHANNELS)[number]["value"];

export const CONDUCT_SEVERITIES = [
  { value: "minor", label: "Minor" },
  { value: "moderate", label: "Moderate" },
  { value: "serious", label: "Serious" },
] as const;

export type ConductSeverity = (typeof CONDUCT_SEVERITIES)[number]["value"];

/**
 * The case's own lifecycle, and deliberately not a list of every state a case
 * can be in: whether an appeal is open is the appeal row's business, and
 * whether an interim action stands is that action's. Folding either in here
 * would have produced the bug #687 warns about, where lifting a safety measure
 * becomes a side effect of closing a case.
 */
export const CONDUCT_STATUSES = [
  { value: "received", label: "Received" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "reviewing", label: "Under review" },
  { value: "decided", label: "Decided" },
  { value: "closed", label: "Closed" },
] as const;

export type ConductStatus = (typeof CONDUCT_STATUSES)[number]["value"];

export const CONDUCT_REVIEW_STAGES = [
  { value: "review", label: "Review" },
  { value: "appeal", label: "Appeal" },
] as const;

export type ConductReviewStage =
  (typeof CONDUCT_REVIEW_STAGES)[number]["value"];

export const CONDUCT_ACTION_KINDS = [
  { value: "interim", label: "Interim" },
  { value: "final", label: "Final" },
] as const;

export type ConductActionKind = (typeof CONDUCT_ACTION_KINDS)[number]["value"];

export function isConductChannel(value: unknown): value is ConductChannel {
  return CONDUCT_CHANNELS.some((channel) => channel.value === value);
}

export function isConductSeverity(value: unknown): value is ConductSeverity {
  return CONDUCT_SEVERITIES.some((severity) => severity.value === value);
}

export function isConductStatus(value: unknown): value is ConductStatus {
  return CONDUCT_STATUSES.some((status) => status.value === value);
}

export function isConductReviewStage(
  value: unknown,
): value is ConductReviewStage {
  return CONDUCT_REVIEW_STAGES.some((stage) => stage.value === value);
}

export function isConductActionKind(
  value: unknown,
): value is ConductActionKind {
  return CONDUCT_ACTION_KINDS.some((kind) => kind.value === value);
}

export function conductLabel(
  options: readonly { value: string; label: string }[],
  value: string | null | undefined,
): string {
  return options.find((option) => option.value === value)?.label ?? "—";
}

/** What one organization has committed to, in numbers. */
export type ConductProcess = {
  /** Days it aims to acknowledge a report in, or null where it says nothing. */
  acknowledgementDays: number | null;
  /** Days the subject has to appeal, or null. */
  appealDays: number | null;
  /** Unconflicted reviewers a review needs, or null. */
  reviewerMinimum: number | null;
  /** Whether an appeal must be heard by people who did not decide it. */
  appealExcludesOriginalReviewers: boolean;
};

/** Every clock absent. What a tenant that has configured nothing gets. */
export const NO_CONDUCT_PROCESS: ConductProcess = {
  acknowledgementDays: null,
  appealDays: null,
  reviewerMinimum: null,
  appealExcludesOriginalReviewers: false,
};

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) > 0
    ? (value as number)
    : null;
}

/**
 * Reads the tenant's configured process.
 *
 * Through `org_conduct_process` rather than `app_settings` directly, for the
 * reason `org_timezone` and `org_fiscal_year` are views: `app_settings`' select
 * policy admits a short list of `manage` holders, and an assigned reviewer
 * holding `conduct_reports:view` and nothing else still has to be told what the
 * deadline on the case in front of them is.
 *
 * Falls back to no clocks at all on a failed read, and says so out loud. That
 * is the same direction as everything else here -- a case with no indicator
 * beats a case with a wrong one -- but a silent fallback would be
 * indistinguishable from a tenant that has configured nothing, which is the
 * state most tenants are legitimately in.
 */
export async function getConductProcess(
  supabase: SupabaseClient,
): Promise<ConductProcess> {
  const { data, error } = await supabase
    .from("org_conduct_process")
    .select(
      "acknowledgement_days, appeal_days, reviewer_minimum, appeal_excludes_original_reviewers",
    )
    .maybeSingle();

  if (error) {
    console.error(
      "[conduct] could not read org_conduct_process; showing the case tracker with no clocks on it",
      error,
    );
    return NO_CONDUCT_PROCESS;
  }

  return {
    acknowledgementDays: positiveInteger(data?.acknowledgement_days),
    appealDays: positiveInteger(data?.appeal_days),
    reviewerMinimum: positiveInteger(data?.reviewer_minimum),
    appealExcludesOriginalReviewers:
      data?.appeal_excludes_original_reviewers === true,
  };
}

/** Whole days between two "YYYY-MM-DD" days, `to - from`. */
function daysBetween(from: string, to: string): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round(
    (utcDateFromIsoDay(to).getTime() - utcDateFromIsoDay(from).getTime()) /
      dayMs,
  );
}

/** A "YYYY-MM-DD" day, `days` later. */
export function isoDayPlus(day: string, days: number): string {
  return addDays(utcDateFromIsoDay(day), days).toISOString().slice(0, 10);
}

export type AcknowledgementState =
  /** This organization publishes no acknowledgement commitment. */
  | { state: "unmeasured"; acknowledgedOn: string | null }
  /** Acknowledged, with whether it landed inside the window. */
  | {
      state: "acknowledged";
      acknowledgedOn: string;
      dueOn: string;
      late: boolean;
    }
  /** Not yet acknowledged, still inside the window. */
  | { state: "due"; dueOn: string; daysLeft: number }
  /** Not yet acknowledged, and the window has passed. */
  | { state: "overdue"; dueOn: string; daysLate: number };

/**
 * Where a report stands against the acknowledgement commitment.
 *
 * "The 5-day clock is the kind of thing that is missed quietly, over a holiday,
 * with nobody realizing" -- #687. This is the function that makes it loud, and
 * it is pure so that the queue, the case view and the attention list all read
 * the same answer rather than three near-copies of the arithmetic.
 *
 * An acknowledged report still reports its due date and whether it was late.
 * Dropping the clock the moment somebody replies would make the record useless
 * for the question actually asked afterwards, which is never "is it
 * acknowledged" but "was it acknowledged in time".
 */
export function acknowledgementState(
  report: { received_on: string; acknowledged_on: string | null },
  process: ConductProcess,
  today: string,
): AcknowledgementState {
  const days = process.acknowledgementDays;
  if (days === null) {
    return { state: "unmeasured", acknowledgedOn: report.acknowledged_on };
  }

  const dueOn = isoDayPlus(report.received_on, days);

  if (report.acknowledged_on) {
    return {
      state: "acknowledged",
      acknowledgedOn: report.acknowledged_on,
      dueOn,
      late: report.acknowledged_on > dueOn,
    };
  }

  const remaining = daysBetween(today, dueOn);
  return remaining >= 0
    ? { state: "due", dueOn, daysLeft: remaining }
    : { state: "overdue", dueOn, daysLate: -remaining };
}

/** Whether a report is one the acknowledgement clock is still waiting on. */
export function awaitingAcknowledgement(state: AcknowledgementState): boolean {
  return state.state === "due" || state.state === "overdue";
}

export type AppealWindowState =
  /** No decision yet, or no published window: nothing to count. */
  | { state: "unmeasured" }
  /** Decided, window open, nothing filed. */
  | { state: "open"; closesOn: string; daysLeft: number }
  /** Decided, window passed, nothing filed. */
  | { state: "closed"; closesOn: string }
  /** An appeal was filed, and whether it arrived inside the window. */
  | { state: "filed"; filedOn: string; closesOn: string | null; late: boolean };

/**
 * Where a decided report stands against the appeal window.
 *
 * A late appeal is reported as late and never refused. The published window is
 * a commitment to *hear* an appeal filed inside it, not a rule against hearing
 * one that arrives afterwards, and an organization that wants to hear a late
 * appeal must be able to record that it did.
 */
export function appealWindowState(
  report: { decided_on: string | null },
  appeal: { filed_on: string } | null,
  process: ConductProcess,
  today: string,
): AppealWindowState {
  const closesOn =
    report.decided_on && process.appealDays !== null
      ? isoDayPlus(report.decided_on, process.appealDays)
      : null;

  if (appeal) {
    return {
      state: "filed",
      filedOn: appeal.filed_on,
      closesOn,
      late: closesOn !== null && appeal.filed_on > closesOn,
    };
  }

  if (closesOn === null) return { state: "unmeasured" };

  const remaining = daysBetween(today, closesOn);
  return remaining >= 0
    ? { state: "open", closesOn, daysLeft: remaining }
    : { state: "closed", closesOn };
}

export type ConductReviewer = {
  user_id: string;
  stage: ConductReviewStage;
  recused_on: string | null;
};

/** The reviewers at one stage who have not stepped back. */
export function activeReviewers(
  reviewers: readonly ConductReviewer[],
  stage: ConductReviewStage,
): ConductReviewer[] {
  return reviewers.filter(
    (reviewer) => reviewer.stage === stage && reviewer.recused_on === null,
  );
}

/**
 * How many unconflicted reviewers a stage is still short of, or null where the
 * organization has named no minimum.
 *
 * Reported rather than enforced. A three-person board handling a report that
 * names one of them may genuinely have nobody left to ask, which is the case
 * #1320 group C exists to answer with a named outside reviewer -- and until it
 * does, a portal that refused to let the review proceed would simply be a
 * portal nobody used for it.
 */
export function reviewerShortfall(
  reviewers: readonly ConductReviewer[],
  stage: ConductReviewStage,
  process: ConductProcess,
): number | null {
  if (process.reviewerMinimum === null) return null;
  return Math.max(
    0,
    process.reviewerMinimum - activeReviewers(reviewers, stage).length,
  );
}

/**
 * Appeal reviewers who also reviewed the original decision.
 *
 * Empty unless the tenant has said the two must be separate, because on a
 * tenant that has not, being on both is not a finding. Recused assignments
 * count on the review side: somebody who was assigned the original review and
 * stepped back was still party to it, and #687's own wording -- "board members
 * who were not part of the original decision" -- reads on assignment rather
 * than on whether a vote was cast.
 */
export function appealReviewerOverlap(
  reviewers: readonly ConductReviewer[],
  process: ConductProcess,
): string[] {
  if (!process.appealExcludesOriginalReviewers) return [];
  const original = new Set(
    reviewers
      .filter((reviewer) => reviewer.stage === "review")
      .map((reviewer) => reviewer.user_id),
  );
  return activeReviewers(reviewers, "appeal")
    .filter((reviewer) => original.has(reviewer.user_id))
    .map((reviewer) => reviewer.user_id);
}

/**
 * The four settings behind `ConductProcess`, as the panel beside the code of
 * conduct renders them (#687).
 *
 * A registry rather than four literals so the Server Action can refuse a key
 * nobody was asked -- the same guard `updateLayoutSettingAction` and the
 * giveaway-rules answers use, and the reason a `conduct.` prefix cannot become
 * a way to write arbitrary `app_settings` rows.
 */
export const CONDUCT_SETTING_PREFIX = "conduct.";

export type ConductProcessSetting = {
  key: string;
  kind: "number" | "boolean";
  label: string;
  help: string;
  /** The word after the number, for the ones that are a count of something. */
  unit?: string;
};

export const CONDUCT_PROCESS_SETTINGS: readonly ConductProcessSetting[] = [
  {
    key: "acknowledgement_days",
    kind: "number",
    unit: "days",
    label: "Acknowledge a report within",
    help: "Counted from the date a report was received. Leave it blank if your code of conduct promises no timescale — the portal then shows no acknowledgement deadline at all, rather than one nobody agreed to.",
  },
  {
    key: "reviewer_minimum",
    kind: "number",
    unit: "reviewers",
    label: "A review needs at least",
    help: "Unconflicted reviewers, counting nobody who has recused themselves. Reported on the case, never enforced: a small board handling a report that names one of its members may have nobody left to ask, and the portal has to let that be recorded rather than refuse it.",
  },
  {
    key: "appeal_days",
    kind: "number",
    unit: "days",
    label: "An appeal can be filed within",
    help: "Counted from the date of the decision. An appeal filed after it is still recorded and simply marked late — this is a commitment to hear one filed in time, not a rule against hearing a late one.",
  },
  {
    key: "appeal_excludes_original_reviewers",
    kind: "boolean",
    label: "An appeal is heard by people who were not part of the decision",
    help: "Flags an appeal reviewer who also reviewed the original, including one who then recused themselves. A note on the case rather than a block, for the same reason the reviewer minimum is.",
  },
] as const;

export function conductProcessSettingKey(key: string): string {
  return `${CONDUCT_SETTING_PREFIX}${key}`;
}

export function conductProcessSetting(
  key: string,
): ConductProcessSetting | undefined {
  return CONDUCT_PROCESS_SETTINGS.find((setting) => setting.key === key);
}

/** The stored values, keyed as the panel edits them. */
export function conductProcessValues(
  process: ConductProcess,
): Record<string, number | boolean | null> {
  return {
    acknowledgement_days: process.acknowledgementDays,
    reviewer_minimum: process.reviewerMinimum,
    appeal_days: process.appealDays,
    appeal_excludes_original_reviewers: process.appealExcludesOriginalReviewers,
  };
}
