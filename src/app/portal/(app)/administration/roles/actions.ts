"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { friendlyError } from "@/lib/db-errors";
import { isPlatformRole, isProtectedRole } from "./protected-roles";

function revalidateRolePaths() {
  revalidatePath("/portal/administration/roles");
  revalidatePath("/portal/administration/users");
  revalidatePath("/portal/administration/permissions");
}

export async function createRoleAction(
  name: string,
  description: string,
  label = "",
): Promise<{ error: string } | { success: true }> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { error: "Role name is required." };
  }

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.from("roles").insert({
    name: trimmedName,
    label: label.trim() || null,
    description: description.trim() || null,
  });
  if (error) {
    return {
      error: friendlyError(
        error,
        "A role with that name already exists.",
        "Could not create role. Please try again.",
      ),
    };
  }

  revalidateRolePaths();
  return { success: true };
}

/**
 * Saves a role's editable fields. The label is tenant-owned and always
 * writable; the name is a platform key, so a rename is only applied to a role
 * this tenant created itself and is rejected outright for `admin` (#910).
 */
export async function updateRoleAction(
  id: string,
  name: string,
  description: string,
  label = "",
): Promise<{ error: string } | { success: true }> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { error: "Role name is required." };
  }

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data: role, error: fetchError } = await supabase
    .from("roles")
    .select("name")
    .eq("id", id)
    .single();
  if (fetchError || !role) {
    return { error: "Role not found." };
  }
  const renaming = trimmedName !== role.name;
  if (renaming && isProtectedRole(role.name)) {
    return { error: "The admin role can't be renamed." };
  }
  if (renaming && isPlatformRole(role.name)) {
    return {
      error:
        "Built-in roles keep their name, which the platform uses to grant permissions. Change the display name instead.",
    };
  }

  const { error } = await supabase
    .from("roles")
    .update({
      name: trimmedName,
      label: label.trim() || null,
      description: description.trim() || null,
    })
    .eq("id", id);
  if (error) {
    return {
      error: friendlyError(
        error,
        "A role with that name already exists.",
        "Could not update role. Please try again.",
      ),
    };
  }

  revalidateRolePaths();
  return { success: true };
}

export async function deleteRoleAction(
  id: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data: role, error: fetchError } = await supabase
    .from("roles")
    .select("name")
    .eq("id", id)
    .single();
  if (fetchError || !role) {
    return { error: "Role not found." };
  }
  // Only `admin` is off limits (#910). A tenant with no board may retire
  // **Board**; the "still assigned to N users" check below is the safety net,
  // and `role_permissions`, `user_roles` and `pending_role_grants` all cascade.
  if (isProtectedRole(role.name)) {
    return { error: "The admin role can't be deleted." };
  }

  const { count, error: countError } = await supabase
    .from("user_roles")
    .select("*", { count: "exact", head: true })
    .eq("role_id", id);
  if (countError) {
    return { error: "Could not check role usage. Please try again." };
  }
  if (count && count > 0) {
    return {
      error: `This role is still assigned to ${count} user${count === 1 ? "" : "s"} and can't be deleted.`,
    };
  }

  const { error } = await supabase.from("roles").delete().eq("id", id);
  if (error) {
    return { error: "Could not delete role. Please try again." };
  }

  revalidateRolePaths();
  return { success: true };
}
