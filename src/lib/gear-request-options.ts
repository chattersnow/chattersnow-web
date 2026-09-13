import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_PUBLIC_GEAR_REQUEST_OPTIONS,
  resolvePublicGearRequestOptions,
  type PublicGearRequestOptions,
} from "@/lib/gear-requests";

/**
 * What the public gear request form may offer for the tenant the request
 * host resolved to (#1032): whether shipping is on, and the payment methods
 * by key and label. Read through `public_gear_request_settings`, which is
 * all `anon` can see of the `gear_requests.*` settings -- the handles and
 * the instructions stay behind it.
 *
 * Cached per request like `getSiteLayout`: the library page reads it to
 * render the form and the Server Action reads it again to validate the
 * submission.
 */
export const getPublicGearRequestOptions = cache(
  async (supabase: SupabaseClient): Promise<PublicGearRequestOptions> => {
    const { data, error } = await supabase
      .from("public_gear_request_settings")
      .select("slot, value");

    // Falling back to "meetup only" is right -- an unreadable setting must
    // not take the form down -- but it must not be silent, for the reason
    // site-layout.ts gives: a swallowed PGRST205 looks like the settings
    // panel refusing to save.
    if (error) {
      console.error(
        "[gear-requests] could not read public_gear_request_settings; offering meetup only",
        error,
      );
      return DEFAULT_PUBLIC_GEAR_REQUEST_OPTIONS;
    }

    return resolvePublicGearRequestOptions(
      (data ?? []) as { slot: string; value: unknown }[],
    );
  },
);
