"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { friendlyError } from "@/lib/db-errors";
import { getRequestOrigin } from "@/lib/request-origin";
import type {
  PendingGrant,
  PortalRoleOption,
  PortalUser,
  SupportGrant,
} from "./users-shared";

export type {
  PortalUser,
  PortalRoleOption,
  SupportGrant,
} from "./users-shared";

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

export async function updateUserPreferredNameAction(
  userId: string,
  preferredName: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase);
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  // Goes through the RPC rather than people.update() because the target may
  // have no people row yet -- an account invited via a pending grant that has
  // never signed in -- where an update would silently affect zero rows.
  const { error } = await supabase.rpc("set_preferred_name_for_user", {
    p_user_id: userId,
    p_preferred_name: preferredName,
  });
  if (error) {
    return { error: "Could not save the preferred name. Please try again." };
  }

  revalidatePath("/portal/administration/users");
  return { success: true };
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

export type { PendingGrant } from "./users-shared";

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

  // The domain the admin is on, so a tenant's invite lands on that tenant's
  // site (#707 Phase 4).
  const siteUrl = await getRequestOrigin();
  const admin = createSupabaseAdminClient();
  const redirectTo = `${siteUrl}/auth/confirm`;

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
    `${siteUrl}/auth/confirm?token_hash=${result.data.properties.hashed_token}` +
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
    // The policy refuses an account that also belongs to another
    // organization: deactivation is platform-wide (#707 Phase 4).
    if (error.code === "42501") {
      return {
        error:
          "This account also belongs to another organization, so it can't be deactivated from here. Remove them from this organization instead.",
      };
    }
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

// Support access (#707 Phase 4) ---------------------------------------------
//
// Time-boxed platform-staff access, granted by this organization's own admin
// and ended by them. The RPCs do the authorization: administration:manage in
// the current tenant, and a caller whose own membership is not itself a
// support grant.

const SUPPORT_ERRORS: Record<string, string> = {
  SUPPORT_CANNOT_GRANT_SUPPORT:
    "Support access can only be granted by a member of this organization.",
  SUPPORT_CANNOT_REVOKE_SUPPORT:
    "Support access can only be ended by a member of this organization.",
  SUPPORT_REASON_REQUIRED: "Say why support access is needed.",
  SUPPORT_EXPIRY_MUST_BE_FUTURE: "The expiry has to be in the future.",
  SUPPORT_EXPIRY_TOO_FAR: "Support access can run for at most 90 days.",
  SUPPORT_USER_NOT_FOUND:
    "No account has that email. Support staff sign in once before access can be granted.",
  SUPPORT_CANNOT_GRANT_SELF: "You can't grant yourself support access.",
  SUPPORT_USER_ALREADY_MEMBER:
    "That account is already a member of this organization.",
  SUPPORT_ROLE_NOT_FOUND: "Unknown role.",
  SUPPORT_GRANT_NOT_FOUND: "This support grant no longer exists.",
  MEMBER_NOT_FOUND: "This account is not a member of this organization.",
  CANNOT_REMOVE_SELF: "You can't remove yourself from the organization.",
};

function rpcErrorMessage(
  error: { message?: string } | null,
  fallback: string,
): string {
  for (const [code, message] of Object.entries(SUPPORT_ERRORS)) {
    if (error?.message?.includes(code)) return message;
  }
  return fallback;
}

export async function listSupportGrantsAction(): Promise<
  { data: SupportGrant[] } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc("list_support_grants");
  if (error) {
    return { error: "Could not load support access. Please try again." };
  }
  return { data: (data ?? []) as SupportGrant[] };
}

/** Whether the caller's own membership lets them grant or end support access. */
export async function canManageSupportAccessAction(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("current_membership_kind");
  return data === "member";
}

export async function grantSupportAccessAction(
  email: string,
  reason: string,
  days: number,
  role: string,
): Promise<{ error: string } | { success: true }> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !trimmedEmail.includes("@")) {
    return { error: "Enter a valid email address." };
  }
  if (!reason.trim()) {
    return { error: SUPPORT_ERRORS.SUPPORT_REASON_REQUIRED };
  }
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return { error: SUPPORT_ERRORS.SUPPORT_EXPIRY_TOO_FAR };
  }

  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const { error } = await supabase.rpc("grant_support_access", {
    p_email: trimmedEmail,
    p_reason: reason.trim(),
    p_expires_at: expiresAt.toISOString(),
    p_role_name: role,
  });
  if (error) {
    return {
      error: rpcErrorMessage(
        error,
        "Could not grant support access. Please try again.",
      ),
    };
  }

  revalidatePath("/portal/administration/users");
  return { success: true };
}

export async function revokeSupportAccessAction(
  membershipId: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("revoke_support_access", {
    p_membership_id: membershipId,
  });
  if (error) {
    return {
      error: rpcErrorMessage(
        error,
        "Could not end support access. Please try again.",
      ),
    };
  }

  revalidatePath("/portal/administration/users");
  return { success: true };
}

/**
 * Drops an account from this organization -- roles and membership here,
 * nothing anywhere else. The path for an account that also belongs to
 * another organization, where platform-wide deactivation is refused.
 */
export async function removeTenantMemberAction(
  userId: string,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(
    supabase,
    "administration",
    "manage",
  );
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("remove_tenant_member", {
    p_user_id: userId,
  });
  if (error) {
    return {
      error: rpcErrorMessage(
        error,
        "Could not remove this user. Please try again.",
      ),
    };
  }

  revalidatePath("/portal/administration/users");
  return { success: true };
}
