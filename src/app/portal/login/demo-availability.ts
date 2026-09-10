import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicTenant, type PublicTenantResult } from "@/lib/branding";
import { isDemoTenant } from "@/lib/portal/tenants";

/**
 * Whether the login page being served should offer the one-click demo (#604).
 *
 * Two conditions, and the second is the one that was missing. Having
 * DEMO_EMAIL and DEMO_PASSWORD is a fact about the *deployment*, and one
 * deployment serves every tenant -- so gating on the credentials alone put
 * "Explore the demo" on every tenant's login page, offering a white-label
 * customer's staff a sign-in to somebody else's sample organization. The demo
 * is a tenant, so the offer belongs to that tenant's host: `plan = 'demo'` on
 * the tenant the request host resolves to.
 *
 * `unresolved` and `unavailable` both mean no tenant was named, and neither
 * gets the button: a host nobody claims is not the demo's, and a failed read
 * is no evidence that it is. Hiding the button there costs a visitor on the
 * real demo host one reload; showing it on a blip would put it back on every
 * host at once.
 *
 * This is a plain module rather than an export of `demo-actions.ts` on
 * purpose: every export of a `"use server"` file becomes a callable endpoint.
 */
export function isDemoLoginOffered(tenantResult: PublicTenantResult): boolean {
  if (!process.env.DEMO_EMAIL || !process.env.DEMO_PASSWORD) return false;
  return (
    tenantResult.status === "resolved" && isDemoTenant(tenantResult.tenant)
  );
}

/** The same question, for a caller that has not read the tenant yet. */
export async function isDemoLoginOfferedOnHost(
  supabase: SupabaseClient,
): Promise<boolean> {
  return isDemoLoginOffered(await getPublicTenant(supabase));
}
