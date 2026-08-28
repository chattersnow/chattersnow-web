"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { parseBylawsForm } from "./bylaws-form";
import { parseContentForm } from "../meetings/content-form";

export type Bylaws = {
  id: string;
  version: string;
  effective_date: string;
  amendment_summary: string | null;
  external_link: string | null;
  body_text: string | null;
};

export type BylawsActionResult = { error: string } | { success: true };

export async function createBylawsAction(
  formData: FormData,
): Promise<BylawsActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a bylaws version.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseBylawsForm(formData);
  if ("error" in parsed) return parsed;
  const content = parseContentForm(formData);
  if ("error" in content) return content;

  const { error } = await supabase.from("bylaws").insert({
    ...parsed.data,
    ...content.data,
  });

  if (error) {
    return { error: "Could not add this bylaws version. Please try again." };
  }

  revalidatePath("/portal/governance/bylaws");
  return { success: true };
}

export async function updateBylawsAction(
  id: string,
  formData: FormData,
): Promise<BylawsActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update this bylaws version.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "governance",
    "manage",
  );
  if (permissionError) return permissionError;

  const parsed = parseBylawsForm(formData);
  if ("error" in parsed) return parsed;
  const content = parseContentForm(formData);
  if ("error" in content) return content;

  const { error } = await supabase
    .from("bylaws")
    .update({ ...parsed.data, ...content.data })
    .eq("id", id);

  if (error) {
    return {
      error: "Could not update this bylaws version. Please try again.",
    };
  }

  revalidatePath("/portal/governance/bylaws");
  return { success: true };
}
