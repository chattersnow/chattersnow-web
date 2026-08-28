import type { SupabaseClient } from "@supabase/supabase-js";

export type AccessManagementStatsSummary = {
  assetsCount: number;
  activeGrantsCount: number;
};

// Neutral counts for the Home dashboard's "Access management" tile --
// distinct from the actionable alerts in attention-items.ts, same split as
// getInventorySummary (a tile) vs. getOpsInboxSummary (alerts).
export async function getAccessManagementStatsSummary(
  supabase: SupabaseClient,
): Promise<AccessManagementStatsSummary> {
  const [{ count: assetsCount }, { count: activeGrantsCount }] =
    await Promise.all([
      supabase
        .from("assets")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("access_grants")
        .select("*", { count: "exact", head: true })
        .eq("status", "active"),
    ]);

  return {
    assetsCount: assetsCount ?? 0,
    activeGrantsCount: activeGrantsCount ?? 0,
  };
}
