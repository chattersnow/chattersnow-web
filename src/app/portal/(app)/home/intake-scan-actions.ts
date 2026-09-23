"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkAnyPermission } from "@/lib/auth/permissions";
import { getRequestHost } from "@/lib/request-origin";
import { parseScannedTag } from "@/lib/inventory-tags";

export type IntakeScan =
  | { kind: "asset_tag"; code: string }
  | {
      kind: "barcode";
      value: string;
      /** From the latest item already carrying this barcode, to prefill. */
      prefill: { description: string; categoryKey: string | null } | null;
    };

/**
 * What a string scanned into the donation form is (#1420 part 4): a blank
 * pre-printed label to bind to the item, or a manufacturer barcode to record
 * on it. Gated like recording the donation itself, and answered by a
 * `security definer` function rather than the part 1 lookup, because the
 * intake volunteer reads neither items nor tags under RLS.
 */
export async function classifyIntakeScanAction(
  scanned: string,
): Promise<{ data: IntakeScan } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    { resource: "finance", level: "manage" },
    { resource: "inventory_intake", level: "manage" },
  ]);
  if (permissionError) return permissionError;

  const candidates = parseScannedTag(scanned, {
    host: await getRequestHost(),
  });
  if (!candidates.asset_tag && !candidates.barcode) {
    return { error: `“${scanned.trim()}” is not a label or a barcode.` };
  }

  const { data, error } = await supabase.rpc("inventory_intake_scan", {
    p_asset_tag: candidates.asset_tag ?? "",
    p_barcode: candidates.barcode ?? "",
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    return { error: "Could not look up that scan. Please try again." };
  }

  if (candidates.asset_tag) {
    if (row.asset_tag_status === "blank") {
      return { data: { kind: "asset_tag", code: candidates.asset_tag } };
    }
    if (row.asset_tag_status === "assigned") {
      return {
        error: `Label ${candidates.asset_tag} is already on another item.`,
      };
    }
    // A six-character code nobody printed. Digits only could still be a
    // barcode, which is what the next branch is for.
    if (!candidates.barcode) {
      return { error: `No unused label has the code ${candidates.asset_tag}.` };
    }
  }

  return {
    data: {
      kind: "barcode",
      value: candidates.barcode!,
      prefill: row.barcode_known
        ? {
            description: row.barcode_description ?? "",
            categoryKey: row.barcode_category_key ?? null,
          }
        : null,
    },
  };
}
