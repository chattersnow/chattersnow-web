import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  deniedRedirectHref,
  getCurrentUserPermissions,
} from "@/lib/auth/permissions";
import { firstAccessibleHref } from "@/lib/portal/nav";

/**
 * Sends the user to the first Volunteers page they can actually open, the same
 * one the sidebar links to. Redirecting to a fixed child instead meant a
 * bookmark or typed /portal/volunteers bounced anyone whose access starts
 * further down the section, even though the sidebar reached it fine.
 */
export default async function VolunteersPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  redirect(
    firstAccessibleHref(permissions, "volunteers") ??
      deniedRedirectHref("Volunteers"),
  );
}
