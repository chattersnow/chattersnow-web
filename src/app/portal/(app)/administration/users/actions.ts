"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { friendlyError } from "@/lib/db-errors";
import { getPortalOrigin } from "@/lib/portal/paths";

export type PortalUser = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  roles: string[];
  created_at: string;
  deactivated_at: string | null;
};

export type PortalRoleOption = {
  id: string;
  name: string;
  description: string | null;
};

export async function listRolesAction(): Promise<
  { data: PortalRoleOption[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("roles")
    .select("id, name, description")
    .order("name");

  if (error) {
    return { error: "Could not load roles. Please try again." };
  }
  return { data: (data ?? []) as PortalRoleOption[] };
}

export async function listUsersAction(): Promise<
  { data: PortalUser[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
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
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return userResult;
  const { user } = userResult;
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
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

export type PendingGrant = {
  id: string;
  email: string;
  name: string | null;
  status: "pending" | "claimed" | "revoked";
  expires_at: string | null;
  created_at: string;
  invited_at: string | null;
  roles: { name: string };
};

export async function listPendingGrantsAction(): Promise<
  { data: PendingGrant[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("pending_role_grants")
    .select(
      "id, email, name, status, expires_at, created_at, invited_at, roles(name)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return { error: "Could not load pending access. Please try again." };
  }
  return { data: (data ?? []) as unknown as PendingGrant[] };
}

export async function createPendingGrantAction(
  email: string,
  role: string,
  name: string,
): Promise<{ error: string } | { success: true }> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !trimmedEmail.includes("@")) {
    return { error: "Enter a valid email address." };
  }
  const trimmedName = name.trim();

  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return userResult;
  const { user } = userResult;
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data: roleRow, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("name", role)
    .single();
  if (roleError || !roleRow) {
    return { error: "Unknown role." };
  }

  const { error } = await supabase.from("pending_role_grants").insert({
    email: trimmedEmail,
    role_id: roleRow.id,
    name: trimmedName || null,
    created_by: user.id,
  });
  if (error) {
    return {
      error: friendlyError(
        error,
        "A pending grant for this email and this role already exists.",
        "Could not stage this grant. Please try again.",
      ),
    };
  }

  revalidatePath("/portal/administration/users");
  return { success: true };
}

export async function revokePendingGrantAction(
  id: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return userResult;
  const { user } = userResult;
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("pending_role_grants")
    .update({
      status: "revoked",
      revoked_by: user.id,
      revoked_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (error) {
    return { error: "Could not revoke this grant. Please try again." };
  }
  if (!data || data.length === 0) {
    return { error: "This grant has already been claimed or revoked." };
  }

  revalidatePath("/portal/administration/users");
  return { success: true };
}

export async function createInviteLinkAction(
  grantId: string,
): Promise<{ error: string } | { success: true; link: string }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return userResult;
  const { user } = userResult;
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data: grant, error: grantError } = await supabase
    .from("pending_role_grants")
    .select("id, email, status")
    .eq("id", grantId)
    .single();
  if (grantError || !grant) {
    return { error: "This pending grant no longer exists." };
  }
  if (grant.status !== "pending") {
    return { error: "This grant has already been claimed or revoked." };
  }

  const admin = createSupabaseAdminClient();
  // Must be the portal origin, not the public site: verifyOtp() in
  // /auth/confirm sets the session cookie on whichever host serves the link,
  // and cookies don't cross the www <-> portal subdomain boundary. An invite
  // consumed on www leaves the recipient signed in there and still staring at
  // a login form on the portal.
  const portalOrigin = getPortalOrigin();
  const redirectTo = `${portalOrigin}/auth/confirm`;

  let result = await admin.auth.admin.generateLink({
    type: "invite",
    email: grant.email,
    options: { redirectTo },
  });
  let linkType: "invite" | "magiclink" = "invite";

  if (result.error?.code === "email_exists") {
    result = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: grant.email,
      options: { redirectTo },
    });
    linkType = "magiclink";
  }

  if (result.error || !result.data) {
    return {
      error: "Could not generate a link for this email. Please try again.",
    };
  }

  const link =
    `${portalOrigin}/auth/confirm?token_hash=${result.data.properties.hashed_token}` +
    `&type=${linkType}&next=/portal/set-password`;

  await supabase
    .from("pending_role_grants")
    .update({ invited_at: new Date().toISOString(), invited_by: user.id })
    .eq("id", grantId);

  revalidatePath("/portal/administration/users");
  return { success: true, link };
}

export async function revokeRoleAction(
  userId: string,
  role: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
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

export async function deactivateUserAction(
  userId: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return userResult;
  const { user } = userResult;
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  if (userId === user.id) {
    return { error: "You can't deactivate your own account." };
  }

  const { error } = await supabase
    .from("deactivated_users")
    .insert({ user_id: userId, deactivated_by: user.id });
  if (error) {
    return {
      error: friendlyError(
        error,
        "This user is already deactivated.",
        "Could not deactivate this user. Please try again.",
      ),
    };
  }

  revalidatePath("/portal/administration/users");
  return { success: true };
}

export async function reactivateUserAction(
  userId: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("deactivated_users")
    .delete()
    .eq("user_id", userId)
    .select("user_id");
  if (error) {
    return { error: "Could not reactivate this user. Please try again." };
  }
  if (!data || data.length === 0) {
    return { error: "This user is not deactivated." };
  }

  revalidatePath("/portal/administration/users");
  return { success: true };
}
