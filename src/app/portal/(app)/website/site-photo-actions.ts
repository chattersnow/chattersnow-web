"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkAnyPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type SitePhotoPathResult = { error: string } | { path: string };

/** The bucket's `allowed_mime_types` (20260921050000), as extensions. */
const SITE_PHOTO_EXTENSIONS = new Set(["jpg", "webp", "png"]);

/**
 * Where the next uploaded site picture goes: `{tenant_id}/{uuid}.jpg` (#921),
 * or `.webp`/`.png` for a logo, which has to keep its transparency (#1488).
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
export async function createSitePhotoPathAction(
  extension: string = "jpg",
): Promise<SitePhotoPathResult> {
  // Named by the browser, which alone knows whether it can encode WebP; held
  // to the bucket's own allowed types so it cannot name anything else.
  if (!SITE_PHOTO_EXTENSIONS.has(extension)) {
    return { error: "That kind of picture can't be uploaded here." };
  }

  const supabase = await createSupabaseServerClient();

  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a photo.",
  );
  if ("error" in userResult) return userResult;

  // Everyone who saves a field that can hold one of these pictures: Website
  // editors; People managers, for a team card photo (#1486) and a sponsor
  // logo; Events managers, for a flier (#1487); and Organization Settings,
  // for the branding logo and app icon (#1488). The insert policy in
  // 20261009220000 matches this list.
  const permissionError = await checkAnyPermission(
    supabase,
    [
      { resource: "site_content", level: "manage" },
      { resource: "people", level: "manage" },
      { resource: "events", level: "manage" },
      { resource: "system_settings", level: "manage" },
    ],
    "You don't have permission to upload pictures here.",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc("current_tenant_id");
  if (error || !data) {
    return { error: "Choose an organization before adding a photo." };
  }

  return { path: `${data}/${crypto.randomUUID()}.${extension}` };
}
