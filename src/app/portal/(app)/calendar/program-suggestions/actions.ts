"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseSuggestionRuleForm } from "./suggestion-rule-form";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { friendlyError } from "@/lib/db-errors";
import type { ProgramSuggestionRule } from "../program-suggestion-shared";

export type SuggestionRuleActionResult = { error: string } | { success: true };

function revalidateSuggestionRulePaths() {
  revalidatePath("/portal/calendar/program-suggestions");
  revalidatePath("/portal/calendar");
}

export async function createSuggestionRuleAction(
  formData: FormData,
): Promise<SuggestionRuleActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to create a suggestion rule.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseSuggestionRuleForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("calendar_program_suggestion_rules")
    .insert({
      item_type: parsed.data.itemType,
      category: parsed.data.category,
      program_id: parsed.data.programId,
      note: parsed.data.note,
      is_active: parsed.data.isActive,
    });

  if (error) {
    return {
      error: friendlyError(
        error,
        "This rule already exists.",
        "Could not create the rule. Please try again.",
      ),
    };
  }

  revalidateSuggestionRulePaths();
  return { success: true };
}

export async function updateSuggestionRuleAction(
  id: string,
  formData: FormData,
): Promise<SuggestionRuleActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update a suggestion rule.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseSuggestionRuleForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("calendar_program_suggestion_rules")
    .update({
      item_type: parsed.data.itemType,
      category: parsed.data.category,
      program_id: parsed.data.programId,
      note: parsed.data.note,
      is_active: parsed.data.isActive,
    })
    .eq("id", id);

  if (error) {
    return {
      error: friendlyError(
        error,
        "This rule already exists.",
        "Could not update the rule. Please try again.",
      ),
    };
  }

  revalidateSuggestionRulePaths();
  return { success: true };
}

export async function deleteSuggestionRuleAction(
  id: string,
): Promise<SuggestionRuleActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to delete a suggestion rule.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("calendar_program_suggestion_rules")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: "Could not delete the rule. Please try again." };
  }

  revalidateSuggestionRulePaths();
  return { success: true };
}

export async function listActiveProgramSuggestionRulesAction(): Promise<
  { data: ProgramSuggestionRule[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "content_calendar",
    "view",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("calendar_program_suggestion_rules")
    .select("id, item_type, category, program_id, note")
    .eq("is_active", true);

  if (error) {
    return {
      error: "Could not load program suggestion rules. Please try again.",
    };
  }
  return { data: (data ?? []) as ProgramSuggestionRule[] };
}
