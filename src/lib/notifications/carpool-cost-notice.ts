import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSiteContent, type SiteContentRow } from "@/lib/site-content";

export const CARPOOL_COST_NOTICE_KEY = "events.carpool_cost_notice";

/**
 * A tenant's published cost-split notice (#1650), for mail sent on the
 * service-role client, which has no request host to resolve a public site
 * from. Only the published value counts -- a draft is not being served -- and
 * no row, or a read that fails, is the platform default, as the public form
 * would show.
 */
export async function loadCarpoolCostNotice(
  admin: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from("site_content")
    .select("key, value")
    .eq("tenant_id", tenantId)
    .eq("key", CARPOOL_COST_NOTICE_KEY)
    .not("value", "is", null);
  if (error) {
    console.error(
      "[carpool-cost-notice] could not read the notice; sending the default",
      error,
    );
  }
  return resolveSiteContent((data ?? []) as SiteContentRow[]).paragraphs(
    CARPOOL_COST_NOTICE_KEY,
  );
}
