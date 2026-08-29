import { createAdminClient } from "./admin-client";
import { SEEDED_PASSWORD } from "./auth";

type AdminClient = ReturnType<typeof createAdminClient>;

function suffix() {
  return crypto.randomUUID().slice(0, 8);
}

/** Mirrors `formatRoleLabel` in src/lib/format.ts, which is what the portal
 * renders for a role name. Duplicated rather than imported so e2e/ stays
 * free of `@/` imports, like every other spec here. */
export function roleLabel(name: string) {
  const spaced = name.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export type SeededUser = Awaited<ReturnType<typeof seedPortalUser>>;
export type SeededRole = Awaited<ReturnType<typeof seedRole>>;

/**
 * Creates a confirmed auth user with no roles, so a test can drive its
 * access entirely through the Administration UI. Every spec that touches
 * users/roles/permissions runs against its own throwaway account rather
 * than the shared seeded ones -- the PR suite runs two Playwright projects
 * concurrently against one Supabase instance, so mutating a seeded account
 * would race the other project.
 */
export async function seedPortalUser(admin: AdminClient) {
  const id = suffix();
  const email = `e2e-user-${id}@example.test`;
  const fullName = `E2E User ${id}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: SEEDED_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) {
    throw new Error(`Could not create ${email}: ${error?.message}`);
  }
  const userId = data.user.id;

  return {
    userId,
    email,
    fullName,
    password: SEEDED_PASSWORD,
    async cleanup() {
      await admin.from("deactivated_users").delete().eq("user_id", userId);
      await admin.from("user_roles").delete().eq("user_id", userId);
      await admin.from("pending_role_grants").delete().eq("email", email);
      await admin.auth.admin.deleteUser(userId);
    },
  };
}

/** Creates a role with no permissions on any resource -- the same starting
 * state the "New role" dialog produces. */
export async function seedRole(admin: AdminClient) {
  const name = `e2e_role_${suffix()}`;

  const { data, error } = await admin
    .from("roles")
    .insert({ name, description: "Created by an e2e test." })
    .select("id")
    .single();
  if (error) throw error;
  const roleId = data.id as string;

  return {
    roleId,
    name,
    label: roleLabel(name),
    async cleanup() {
      await admin.from("role_permissions").delete().eq("role_id", roleId);
      await admin.from("user_roles").delete().eq("role_id", roleId);
      await admin.from("roles").delete().eq("id", roleId);
    },
  };
}

/** Deletes any role left behind by a spec that creates one through the UI
 * (and therefore has no id to clean up by). */
export async function deleteRoleByName(admin: AdminClient, name: string) {
  const { data } = await admin
    .from("roles")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if (!data) return;
  await admin.from("role_permissions").delete().eq("role_id", data.id);
  await admin.from("user_roles").delete().eq("role_id", data.id);
  await admin.from("roles").delete().eq("id", data.id);
}
