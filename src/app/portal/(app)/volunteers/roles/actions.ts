"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseRoleTypeForm } from "./role-type-form";
import { checkPermission } from "@/lib/auth/permissions";

export type RoleTypeActionResult = { error: string } | { success: true };

function friendlyError(error: { code?: string }, fallback: string) {
  return error.code === "23505" ? "A role type with this name already exists." : fallback;
}

export async function createRoleTypeAction(formData: FormData): Promise<RoleTypeActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to create a role type." };
  }
  const permissionError = await checkPermission(supabase, "volunteers", "manage");
  if (permissionError) return permissionError;

  const parsed = parseRoleTypeForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("volunteer_role_types").insert(parsed.data);

  if (error) {
    return { error: friendlyError(error, "Could not create the role type. Please try again.") };
  }

  revalidatePath("/portal/volunteers/roles");
  return { success: true };
}

export async function updateRoleTypeAction(
  id: string,
  formData: FormData
): Promise<RoleTypeActionResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to update a role type." };
  }
  const permissionError = await checkPermission(supabase, "volunteers", "manage");
  if (permissionError) return permissionError;

  const parsed = parseRoleTypeForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("volunteer_role_types").update(parsed.data).eq("id", id);

  if (error) {
    return { error: friendlyError(error, "Could not update the role type. Please try again.") };
  }

  revalidatePath("/portal/volunteers/roles");
  return { success: true };
}

export type RoleType = { id: string; name: string };

export async function listRoleTypesAction(): Promise<{ data: RoleType[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "volunteers", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("volunteer_role_types")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    return { error: "Could not load role types. Please try again." };
  }
  return { data: (data ?? []) as RoleType[] };
}
