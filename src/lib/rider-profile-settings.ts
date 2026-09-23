import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseMountainList,
  type PublicRiderProfile,
} from "@/lib/rider-profile";

/**
 * Registration's riding questions for the tenant the request host resolves to
 * (#1408, #1415).
 *
 * `public_rider_profile_settings` returns a row only when that tenant has the
 * `rider_profile` module, so one read answers both "is it asked" and "which
 * mountains". Null on a failed read too: the form then registers without the
 * questions, which is the quiet direction -- a failed settings read should not
 * stand between somebody and a registration.
 */
export async function getPublicRiderProfile(
  supabase: SupabaseClient,
): Promise<PublicRiderProfile | null> {
  const { data, error } = await supabase
    .from("public_rider_profile_settings")
    .select("mountains")
    .maybeSingle();
  if (error || !data) return null;
  return { mountains: parseMountainList(data.mountains) };
}

/**
 * The current tenant's mountain list, for the portal (#1408). Null when the
 * caller may not see rider profiles, which includes every caller on a tenant
 * without the module.
 */
export async function getRiderProfileMountains(
  supabase: SupabaseClient,
): Promise<string[] | null> {
  const { data, error } = await supabase.rpc("rider_profile_mountains");
  if (error || data === null) return null;
  return parseMountainList(data);
}
