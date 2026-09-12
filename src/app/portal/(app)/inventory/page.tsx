import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  deniedRedirectHref,
  getCurrentUserPermissions,
} from "@/lib/auth/permissions";
import { firstAccessibleHref } from "@/lib/portal/nav";
import { getTenantLexicon } from "@/lib/tenant-lexicon";

/**
 * Sends the user to the first Inventory page they can actually open, the same
 * one the sidebar links to. Redirecting to a fixed child instead meant a
 * bookmark or typed /portal/inventory bounced anyone whose access starts
 * further down the section, even though the sidebar reached it fine.
 */
export default async function InventoryPage() {
  const supabase = await createSupabaseServerClient();
  const [permissions, lexicon] = await Promise.all([
    getCurrentUserPermissions(supabase),
    getTenantLexicon(supabase),
  ]);
  redirect(
    firstAccessibleHref(permissions, "inventory") ??
      deniedRedirectHref(lexicon.collection),
  );
}
