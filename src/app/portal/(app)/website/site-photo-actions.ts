"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type SitePhotoPathResult = { error: string } | { path: string };

/**
 * Where the next uploaded site photo goes: `{tenant_id}/{uuid}.jpg` (#921).
 *
 * The storage policies in 20260921050000 are what actually enforce the tenant
 * prefix and the permission -- a browser could compute the same string itself,
 * since `current_tenant_id()` is granted to `authenticated`. This exists for
 * the two things the database cannot do well from inside an RLS check:
 *
 * - refuse *before* the browser spends several seconds decoding and re-encoding
 *   a 12 MP photo, rather than after, and in the codebase's usual `{ error }`
 *   shape; and
 * - name the null-tenant case. Somebody in more than one organization who has
 *   not picked one yet gets `current_tenant_id() = null`, and a browser would
 *   cheerfully build "null/....jpg" and receive an inscrutable RLS refusal.
 *
 * Nothing is written, so there is no `revalidatePath`.
 */
export async function createSitePhotoPathAction(): Promise<SitePhotoPathResult> {
  const supabase = await createSupabaseServerClient();

  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a photo.",
  );
  if ("error" in userResult) return userResult;

  const permissionError = await checkPermission(
    supabase,
    "site_content",
    "manage",
    "You don't have permission to change the site's photos.",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc("current_tenant_id");
  if (error || !data) {
    return { error: "Choose an organization before adding a photo." };
  }

  return { path: `${data}/${crypto.randomUUID()}.jpg` };
}
