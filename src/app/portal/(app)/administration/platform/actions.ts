"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { mintInviteLink } from "@/lib/auth/invite-link";
import { getRequestOrigin } from "@/lib/request-origin";
import { friendlyError } from "@/lib/db-errors";
import type { PlatformTenant } from "./platform-shared";

export type { PlatformTenant } from "./platform-shared";

/**
 * Every action here re-checks the permission before calling its RPC, the way
 * every other Administration action does -- and every RPC checks all three
 * conditions again for itself (`require_platform_operator`). The duplication is
 * the point: the action's check is what turns a refusal into a message, and the
 * database's is what makes it true. Only `provisionTenantAction` reaches a
 * service-role client, and it does so after both.
 */
async function guard() {
  const supabase = await createSupabaseServerClient();
  const denied = await checkPermission(supabase, "platform_tenants", "manage");
  return { supabase, denied };
}

export async function listTenantsAction(): Promise<
  { data: PlatformTenant[] } | { error: string }
> {
  const { supabase, denied } = await guard();
  if (denied) return denied;

  const { data, error } = await supabase.rpc("platform_list_tenants");
  if (error) return { error: "Could not load tenants. Please try again." };
  return { data: (data ?? []) as PlatformTenant[] };
}

export async function provisionTenantAction(input: {
  name: string;
  slug: string;
  customDomain: string;
  plan: string;
  adminEmail: string;
}): Promise<{ error: string } | { success: true; link: string | null }> {
  const { supabase, denied } = await guard();
  if (denied) return denied;

  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  const adminEmail = input.adminEmail.trim();
  if (!name) return { error: "Enter the organization's name." };
  if (!slug) return { error: "Enter a slug." };

  const { error } = await supabase.rpc("platform_provision_tenant", {
    p_name: name,
    p_slug: slug,
    p_custom_domain: input.customDomain.trim() || null,
    p_plan: input.plan,
    p_admin_email: adminEmail || null,
  });
  if (error) {
    return {
      error: friendlyError(
        error,
        "That slug or domain is already taken. Both have to be unique across the platform.",
        error.message ?? "Could not provision the tenant.",
      ),
    };
  }

  revalidatePath("/portal/administration/platform");

  // The tenant exists either way. A failure past this point is worth reporting
  // as "provisioned, link failed" rather than as a failure -- re-running
  // provisioning would collide on the slug, and the operator can mint the link
  // from the new tenant's own Users page or the CLI.
  if (!adminEmail) return { success: true, link: null };

  // The link has to land on the tenant's own domain, not on ours, or the first
  // admin signs in somewhere that is not their site. Falls back to the origin
  // the operator is on when the tenant has no domain yet.
  const domain = input.customDomain.trim().toLowerCase();
  const origin = domain ? `https://${domain}` : await getRequestOrigin();
  const minted = await mintInviteLink(adminEmail, origin);
  return { success: true, link: "error" in minted ? null : minted.link };
}

export async function setTenantDomainAction(
  tenantId: string,
  customDomain: string,
): Promise<{ error: string } | { success: true }> {
  const { supabase, denied } = await guard();
  if (denied) return denied;

  const { error } = await supabase.rpc("platform_set_tenant_domain", {
    p_tenant_id: tenantId,
    p_custom_domain: customDomain.trim() || null,
  });
  if (error) {
    return {
      error: friendlyError(
        error,
        "Another tenant already has that domain.",
        error.message ?? "Could not set the domain.",
      ),
    };
  }
  revalidatePath("/portal/administration/platform");
  return { success: true };
}

export async function setTenantStatusAction(
  tenantId: string,
  status: string,
): Promise<{ error: string } | { success: true }> {
  const { supabase, denied } = await guard();
  if (denied) return denied;

  const { error } = await supabase.rpc("platform_set_tenant_status", {
    p_tenant_id: tenantId,
    p_status: status,
  });
  if (error) {
    return { error: error.message ?? "Could not change the status." };
  }
  revalidatePath("/portal/administration/platform");
  return { success: true };
}
