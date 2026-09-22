"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkAnyPermission, checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { friendlyError } from "@/lib/db-errors";
import { getOrgTimeZone } from "@/lib/org-timezone";
import { todayInZone } from "@/lib/time";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseConductActionForm,
  parseConductAppealDecisionForm,
  parseConductAppealForm,
  parseConductLiftForm,
  parseConductProgressForm,
  parseConductRecusalForm,
  parseConductReportForm,
  parseConductReviewerForm,
} from "./conduct-report-form";

/**
 * Every write in the conduct area.
 *
 * Two things are consistent across all of them and are the reason they live in
 * one file rather than beside each card:
 *
 *   * **Dates are the organization's, not the server's.** "Today" comes from
 *     `org.timezone`, so a report entered at 8pm in Denver is not received
 *     tomorrow because Supabase runs in UTC (#1065). Every parser takes it.
 *   * **The permission is `conduct_reports`, never `governance`.** The route
 *     guard admits reviewers at `view`; every write here re-checks `manage`
 *     except the one a reviewer makes about themselves, which goes through a
 *     database function instead of a policy (see `recuseFromConductReportAction`).
 */

export type ConductActionResult =
  { error: string; field?: string } | { success: true };

const CONDUCT_PATH = "/portal/conduct";

function casePath(id: string): string {
  return `${CONDUCT_PATH}/${id}`;
}

/** The signed-in intake holder, plus the organization's today. */
async function intakeContext(
  message: string,
): Promise<
  | { error: string }
  | { supabase: SupabaseClient; userId: string; today: string }
> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase, message);
  if ("error" in userResult) return userResult;

  const permissionError = await checkPermission(
    supabase,
    "conduct_reports",
    "manage",
  );
  if (permissionError) return permissionError;

  const zone = await getOrgTimeZone(supabase);
  return { supabase, userId: userResult.user.id, today: todayInZone(zone) };
}

export async function createConductReportAction(
  formData: FormData,
): Promise<ConductActionResult & { id?: string }> {
  const context = await intakeContext(
    "You must be signed in to record a report.",
  );
  if ("error" in context) return context;

  const parsed = parseConductReportForm(formData, context.today);
  if ("error" in parsed) return parsed;

  const { data, error } = await context.supabase
    .from("conduct_reports")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) {
    return {
      error: friendlyError(
        error,
        "A report with this reference already exists.",
        "Could not record the report. Please try again.",
      ),
    };
  }

  revalidatePath(CONDUCT_PATH);
  return { success: true, id: data.id as string };
}

export async function updateConductReportAction(
  id: string,
  formData: FormData,
): Promise<ConductActionResult> {
  const context = await intakeContext(
    "You must be signed in to edit a report.",
  );
  if ("error" in context) return context;

  const parsed = parseConductReportForm(formData, context.today);
  if ("error" in parsed) return parsed;

  const { error } = await context.supabase
    .from("conduct_reports")
    .update({ ...parsed.data, updated_by: context.userId })
    .eq("id", id);

  if (error) {
    return { error: "Could not save the report. Please try again." };
  }

  revalidatePath(CONDUCT_PATH);
  revalidatePath(casePath(id));
  return { success: true };
}

/**
 * One named step of the case's progress.
 *
 * The status and the date it implies are written in the same statement, which
 * is what keeps `conduct_reports_closed_is_dated` and its siblings from ever
 * being the thing that refuses a save. Reopening clears the closing date and
 * puts the case back where its own record says it was -- decided if there is a
 * decision, under review if there is not -- rather than inventing a state.
 */
export async function advanceConductCaseAction(
  id: string,
  formData: FormData,
): Promise<ConductActionResult> {
  const context = await intakeContext(
    "You must be signed in to update a case.",
  );
  if ("error" in context) return context;

  const parsed = parseConductProgressForm(formData, context.today);
  if ("error" in parsed) return parsed;

  // The case's own record decides two of the steps, so it is read before it is
  // written rather than guessed at: acknowledging must not drag a case under
  // review back to "acknowledged", and reopening has to land on whichever of
  // decided or reviewing the record says it was.
  const { data: current, error: readError } = await context.supabase
    .from("conduct_reports")
    .select("status, decided_on")
    .eq("id", id)
    .maybeSingle();
  if (readError || !current) {
    return { error: "Could not update the case. Please try again." };
  }

  const step = parsed.data;
  let update: Record<string, unknown>;

  switch (step.step) {
    case "acknowledge":
      update = {
        acknowledged_on: step.acknowledged_on,
        status: current.status === "received" ? "acknowledged" : current.status,
      };
      break;
    case "review":
      update = { status: "reviewing" };
      break;
    case "decide":
      update = {
        decided_on: step.decided_on,
        outcome: step.outcome,
        status: "decided",
      };
      break;
    case "close":
      update = { closed_on: step.closed_on, status: "closed" };
      break;
    case "reopen":
      update = {
        closed_on: null,
        status: current.decided_on ? "decided" : "reviewing",
      };
      break;
  }

  const { error } = await context.supabase
    .from("conduct_reports")
    .update({ ...update, updated_by: context.userId })
    .eq("id", id);

  if (error) {
    // 23514 is conduct_reports_dates_follow_receipt, and it is the one failure
    // here a person can fix: a date typed before the report arrived.
    return {
      error:
        error.code === "23514"
          ? "That date is before the report was received."
          : "Could not update the case. Please try again.",
    };
  }

  revalidatePath(CONDUCT_PATH);
  revalidatePath(casePath(id));
  return { success: true };
}

export async function assignConductReviewerAction(
  reportId: string,
  formData: FormData,
): Promise<ConductActionResult> {
  const context = await intakeContext(
    "You must be signed in to assign a reviewer.",
  );
  if ("error" in context) return context;

  const parsed = parseConductReviewerForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await context.supabase
    .from("conduct_report_reviewers")
    .insert({ report_id: reportId, ...parsed.data });

  if (error) {
    // The database refuses an assignment to somebody whose role does not carry
    // `conduct_reports` (check_conduct_reviewer_can_see), because an
    // assignment that shows its subject nothing is worse than none: the case
    // then waits on a review that cannot start, and nobody involved can tell.
    if (String(error.message).includes("REVIEWER_CANNOT_SEE_CONDUCT_REPORTS")) {
      return {
        error:
          "This person cannot see conduct reports. Grant them Conduct reports at View in Administration › Roles first.",
        field: "userId",
      };
    }
    return {
      error: friendlyError(
        error,
        "They are already assigned to this stage.",
        "Could not assign the reviewer. Please try again.",
      ),
      field: "userId",
    };
  }

  revalidatePath(casePath(reportId));
  return { success: true };
}

/**
 * Unassigning is a correction, not a recusal, and the database only allows it
 * while the row carries no recusal: a recusal is a record of something that
 * happened and is never deleted.
 */
export async function unassignConductReviewerAction(
  reportId: string,
  reviewerId: string,
): Promise<ConductActionResult> {
  const context = await intakeContext(
    "You must be signed in to change reviewers.",
  );
  if ("error" in context) return context;

  const { error } = await context.supabase
    .from("conduct_report_reviewers")
    .delete()
    .eq("id", reviewerId);

  if (error) {
    return { error: "Could not remove the reviewer. Please try again." };
  }

  revalidatePath(casePath(reportId));
  return { success: true };
}

/**
 * The one write a reviewer can make, and the only action here that does not
 * require `manage`.
 *
 * Through `recuse_from_conduct_report()` rather than an update, because "may
 * update their own assignment" is a much wider grant than the one thing meant:
 * the function can only set a recusal, only on the caller's own live row.
 */
export async function recuseFromConductReportAction(
  reportId: string,
  formData: FormData,
): Promise<ConductActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to step back from a report.",
  );
  if ("error" in userResult) return userResult;

  const permissionError = await checkAnyPermission(supabase, [
    { resource: "conduct_reports", level: "view" },
  ]);
  if (permissionError) return permissionError;

  const parsed = parseConductRecusalForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.rpc("recuse_from_conduct_report", {
    p_report_id: reportId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    if (String(error.message).includes("NOT_ASSIGNED")) {
      return { error: "You are not assigned to this report." };
    }
    return { error: "Could not record your recusal. Please try again." };
  }

  // The case leaves this reviewer's view entirely, so the list is what they
  // come back to.
  revalidatePath(CONDUCT_PATH);
  revalidatePath(casePath(reportId));
  return { success: true };
}

export async function recordConductActionAction(
  reportId: string,
  formData: FormData,
): Promise<ConductActionResult> {
  const context = await intakeContext(
    "You must be signed in to record an action.",
  );
  if ("error" in context) return context;

  const parsed = parseConductActionForm(formData, context.today);
  if ("error" in parsed) return parsed;

  const { error } = await context.supabase
    .from("conduct_report_actions")
    .insert({ report_id: reportId, ...parsed.data });

  if (error) {
    return { error: "Could not record the action. Please try again." };
  }

  revalidatePath(casePath(reportId));
  return { success: true };
}

export async function liftConductActionAction(
  reportId: string,
  actionId: string,
  formData: FormData,
): Promise<ConductActionResult> {
  const context = await intakeContext(
    "You must be signed in to lift an action.",
  );
  if ("error" in context) return context;

  const parsed = parseConductLiftForm(formData, context.today);
  if ("error" in parsed) return parsed;

  const { error } = await context.supabase
    .from("conduct_report_actions")
    .update({ ...parsed.data, updated_by: context.userId })
    .eq("id", actionId);

  if (error) {
    return {
      error: friendlyError(
        error,
        "An action cannot be lifted before it was taken.",
        "Could not lift the action. Please try again.",
      ),
      field: "liftedOn",
    };
  }

  revalidatePath(casePath(reportId));
  return { success: true };
}

export async function fileConductAppealAction(
  reportId: string,
  formData: FormData,
): Promise<ConductActionResult> {
  const context = await intakeContext(
    "You must be signed in to record an appeal.",
  );
  if ("error" in context) return context;

  const parsed = parseConductAppealForm(formData, context.today);
  if ("error" in parsed) return parsed;

  const { error } = await context.supabase
    .from("conduct_report_appeals")
    .insert({ report_id: reportId, ...parsed.data });

  if (error) {
    return {
      error: friendlyError(
        error,
        "An appeal is already recorded against this report.",
        "Could not record the appeal. Please try again.",
      ),
    };
  }

  revalidatePath(casePath(reportId));
  return { success: true };
}

export async function decideConductAppealAction(
  reportId: string,
  appealId: string,
  formData: FormData,
): Promise<ConductActionResult> {
  const context = await intakeContext(
    "You must be signed in to decide an appeal.",
  );
  if ("error" in context) return context;

  const parsed = parseConductAppealDecisionForm(formData, context.today);
  if ("error" in parsed) return parsed;

  const { error } = await context.supabase
    .from("conduct_report_appeals")
    .update({ ...parsed.data, updated_by: context.userId })
    .eq("id", appealId);

  if (error) {
    return {
      error: friendlyError(
        error,
        "An appeal cannot be decided before it was filed.",
        "Could not record the decision. Please try again.",
      ),
      field: "decidedOn",
    };
  }

  revalidatePath(casePath(reportId));
  return { success: true };
}

export type ConductReviewerCandidate = {
  user_id: string;
  email: string | null;
  full_name: string | null;
};

/**
 * Who intake may assign, read from the database rather than from the people
 * directory: a reviewer is a portal account, and the list is exactly the
 * accounts that can actually open a case.
 */
export async function listConductReviewerCandidatesAction(): Promise<
  { data: ConductReviewerCandidate[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "conduct_reports",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc(
    "list_conduct_reviewer_candidates",
  );
  if (error) {
    return { error: "Could not load who can be assigned. Please try again." };
  }
  return { data: (data ?? []) as ConductReviewerCandidate[] };
}

export type ConductEventOption = { id: string; name: string };

/**
 * The events a report can be filed against.
 *
 * Its own action rather than a prop on the page, so the events query runs when
 * somebody opens the form rather than on every visit to the queue -- and so a
 * failure is a missing picker rather than a missing page. An intake holder who
 * cannot read events gets an empty list and types the context instead, which is
 * the same degradation the reporter and subject pickers have.
 */
export async function listConductEventOptionsAction(): Promise<
  ConductEventOption[]
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "conduct_reports",
    "manage",
  );
  if (permissionError) return [];

  const { data } = await supabase
    .from("events")
    .select("id, name")
    .order("starts_at", { ascending: false })
    .limit(100);
  return (data ?? []) as ConductEventOption[];
}
