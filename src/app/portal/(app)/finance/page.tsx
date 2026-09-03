import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  deniedRedirectHref,
  getCurrentUserPermissions,
} from "@/lib/auth/permissions";
import { firstAccessibleHref } from "@/lib/portal/nav";

/**
 * Sends the user to the first Finance page they can actually open, the same
 * one the sidebar links to. Redirecting to a fixed child instead meant a
 * bookmark or typed /portal/finance bounced anyone whose access starts
 * further down the section, even though the sidebar reached it fine.
 */
export default async function FinancePage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  redirect(
    firstAccessibleHref(permissions, "finance") ??
      deniedRedirectHref("Finance"),
  );
}
