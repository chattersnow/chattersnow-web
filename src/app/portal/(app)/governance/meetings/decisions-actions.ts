"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { parseDecisionForm } from "./decision-form";

export type Decision = {
  id: string;
  meeting_id: string;
  description: string;
  decision_date: string;
};

export type DecisionActionResult = { error: string } | { success: true };

export async function listDecisionsAction(
  meetingId: string,
): Promise<{ data: Decision[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("governance_meeting_decisions")
    .select("id, meeting_id, description, decision_date")
    .eq("meeting_id", meetingId)
    .order("decision_date", { ascending: true });

  if (error) {
    return { error: "Could not load decisions. Please try again." };
  }
  return { data: (data ?? []) as Decision[] };
}

export async function createDecisionAction(
  meetingId: string,
  formData: FormData,
): Promise<DecisionActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a decision.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseDecisionForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("governance_meeting_decisions")
    .insert({ meeting_id: meetingId, ...parsed.data });

  if (error) {
    return { error: "Could not add this decision. Please try again." };
  }

  revalidatePath("/portal/governance/meetings");
  return { success: true };
}

export async function deleteDecisionAction(
  id: string,
): Promise<DecisionActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to remove this decision.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("governance_meeting_decisions")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: "Could not remove this decision. Please try again." };
  }

  revalidatePath("/portal/governance/meetings");
  return { success: true };
}
