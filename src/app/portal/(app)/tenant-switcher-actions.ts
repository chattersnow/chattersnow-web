"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Points the signed-in user at a different tenant.
 *
 * All the validation lives in set_current_tenant() (20260905180000), which
 * refuses any tenant the caller does not hold a live membership in -- so a
 * forged id in the request body fails at the database rather than here.
 *
 * Returns { error } rather than throwing, per the Server Action convention in
 * `src/lib/auth/permissions.ts`: a failure has to come back as something the
 * dialog can show, not a navigation.
 */
export async function switchTenantAction(
  tenantId: string,
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("set_current_tenant", {
    p_tenant_id: tenantId,
  });
  if (error) return { error: "You no longer have access to that account." };

  // Every portal page reads tenant-scoped data from Phase 2 onward, and the
  // shell itself shows the tenant name, so the whole layout is stale.
  revalidatePath("/portal", "layout");
  return null;
}
