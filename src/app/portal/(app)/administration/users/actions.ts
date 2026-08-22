"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PORTAL_ROLES, type PortalRole } from "@/lib/auth/roles";

export type PortalUser = {
  user_id: string;
  email: string | null;
  roles: PortalRole[];
  created_at: string;
};

export async function listUsersAction(): Promise<{ data: PortalUser[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_portal_users");

  if (error) {
    return { error: "Could not load users. Please try again." };
  }
  return { data: (data ?? []) as PortalUser[] };
}

function isPortalRole(value: string): value is PortalRole {
  return (PORTAL_ROLES as readonly string[]).includes(value);
}

export async function assignRoleAction(
  userId: string,
  role: string,
): Promise<{ error: string } | { success: true }> {
  if (!isPortalRole(role)) {
    return { error: "Unknown role." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in." };
  }

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
  if (!isPortalRole(role)) {
    return { error: "Unknown role." };
  }

  const supabase = await createSupabaseServerClient();
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
