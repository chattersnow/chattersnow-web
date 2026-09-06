import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  brandingFromRows,
  EMPTY_BRANDING,
  type Branding,
  type BrandingRow,
} from "@/lib/branding";

/**
 * The branding of the tenant the signed-in user has selected, for the
 * portal shell. Read through `tenant_branding` (session-resolved, unlike the
 * host-resolved `public_branding`), and cached per request because the
 * outer portal layout applies it and the sidebar shows the logo.
 */
export const getTenantBranding = cache(
  async (supabase: SupabaseClient): Promise<Branding> => {
    const { data, error } = await supabase
      .from("tenant_branding")
      .select("token, value");
    if (error) return EMPTY_BRANDING;
    return brandingFromRows((data ?? []) as BrandingRow[]);
  },
);
