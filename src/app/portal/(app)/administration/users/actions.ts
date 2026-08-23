"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";

export type PortalUser = {
  user_id: string;
  email: string | null;
  roles: string[];
  created_at: string;
};

export type PortalRoleOption = {
  id: string;
  name: string;
  description: string | null;
};

export async function listRolesAction(): Promise<{ data: PortalRoleOption[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "administration", "manage");
  if (permissionError) return permissionError;

  const { data, error } = await supabase.from("roles").select("id, name, description").order("name");

  if (error) {
    return { error: "Could not load roles. Please try again." };
  }
  return { data: (data ?? []) as PortalRoleOption[] };
}

export async function createRoleAction(
  name: string,
  description: string,
): Promise<{ error: string } | { success: true }> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { error: "Role name is required." };
  }

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "administration", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("roles")
    .insert({ name: trimmedName, description: description.trim() || null });
  if (error) {
    return { error: error.message.includes("duplicate") ? "A role with that name already exists." : "Could not create role. Please try again." };
  }

  revalidatePath("/portal/administration/users");
  revalidatePath("/portal/administration/permissions");
  return { success: true };
}

export async function listUsersAction(): Promise<{ data: PortalUser[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "administration", "manage");
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc("list_portal_users");

  if (error) {
    return { error: "Could not load users. Please try again." };
  }
  return { data: (data ?? []) as PortalUser[] };
}

export async function assignRoleAction(
  userId: string,
  role: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in." };
  }
  const permissionError = await checkPermission(supabase, "administration", "manage");
  if (permissionError) return permissionError;

  const { data: roleRow, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("name", role)
    .single();
  if (roleError || !roleRow) {
    return { error: "Unknown role." };
  }

  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: userId, role_id: roleRow.id, created_by: user.id });
  if (error) {
    return { error: "Could not assign role. Please try again." };
  }

  revalidatePath("/portal/administration/users");
  return { success: true };
}

export async function revokeRoleAction(
  userId: string,
  role: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "administration", "manage");
  if (permissionError) return permissionError;

  const { data: roleRow, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("name", role)
    .single();
  if (roleError || !roleRow) {
    return { error: "Unknown role." };
  }

  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role_id", roleRow.id);
  if (error) {
    return { error: "Could not remove role. Please try again." };
  }

  revalidatePath("/portal/administration/users");
  return { success: true };
}
