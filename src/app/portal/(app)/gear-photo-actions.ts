"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkAnyPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type GearPhotoPathResult = { error: string } | { path: string };

/**
 * Where the next gear photo goes: `{tenant_id}/{uuid}.jpg` (#781).
 *
 * The storage policies in 20260907160000 are what actually enforce the tenant
 * prefix and the permission -- a browser could compute the same string itself,
 * since `current_tenant_id()` is granted to `authenticated`. This exists for
 * the two things the database cannot do well from inside an RLS check:
 *
 * - refuse *before* a phone spends several seconds compressing and uploading,
 *   rather than after, and in the codebase's usual `{ error }` shape; and
 * - name the null-tenant case. Somebody in more than one organization who has
 *   not picked one yet gets `current_tenant_id() = null`, and a browser would
 *   cheerfully build "null/....jpg" and receive an inscrutable RLS refusal.
 *
 * Nothing is written, so there is no `revalidatePath`. Shared by both photo
 * surfaces (donation intake and the inventory item editor), which is why it
 * sits at the route-group root rather than under either of them.
 */
export async function createGearPhotoPathAction(): Promise<GearPhotoPathResult> {
  const supabase = await createSupabaseServerClient();

  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a photo.",
  );
  if ("error" in userResult) return userResult;

  const permissionError = await checkAnyPermission(supabase, [
    { resource: "inventory", level: "manage" },
    { resource: "inventory_intake", level: "manage" },
  ]);
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc("current_tenant_id");
  if (error || !data) {
    return { error: "Choose an organization before adding a photo." };
  }

  return { path: `${data}/${crypto.randomUUID()}.jpg` };
}
