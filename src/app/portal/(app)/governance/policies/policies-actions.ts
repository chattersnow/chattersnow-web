"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { parsePolicyForm } from "./policy-form";
import { parseContentForm } from "../meetings/content-form";

export type Policy = {
  id: string;
  name: string;
  category: string | null;
  effective_date: string;
  version: string;
  external_link: string | null;
  body_text: string | null;
};

export type PolicyActionResult = { error: string } | { success: true };

export async function createPolicyAction(
  formData: FormData,
): Promise<PolicyActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a policy.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parsePolicyForm(formData);
  if ("error" in parsed) return parsed;
  const content = parseContentForm(formData);
  if ("error" in content) return content;

  const { error } = await supabase.from("policies").insert({
    ...parsed.data,
    ...content.data,
  });

  if (error) {
    return { error: "Could not add this policy. Please try again." };
  }

  revalidatePath("/portal/governance/policies");
  return { success: true };
}

export async function updatePolicyAction(
  id: string,
  formData: FormData,
): Promise<PolicyActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update this policy.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parsePolicyForm(formData);
  if ("error" in parsed) return parsed;
  const content = parseContentForm(formData);
  if ("error" in content) return content;

  const { error } = await supabase
    .from("policies")
    .update({ ...parsed.data, ...content.data })
    .eq("id", id);

  if (error) {
    return { error: "Could not update this policy. Please try again." };
  }

  revalidatePath("/portal/governance/policies");
  return { success: true };
}
