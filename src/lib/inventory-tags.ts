import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Scannable inventory tags (#1420). One module turns whatever a scanner hands
 * over -- a label's URL, a code typed off it, a manufacturer barcode, an NFC
 * chip's serial -- into the item(s) it identifies. The `/portal/t/[code]`
 * resolver, the in-page camera scanner and the keyboard-wedge input all go
 * through `lookupInventoryTag`, so the three cannot disagree about what a scan
 * means.
 */

export type InventoryTagKind = "asset_tag" | "barcode" | "nfc";

/** The path an asset-tag label encodes, before the code. */
export const TAG_PATH_PREFIX = "/portal/t/";
const SHORT_TAG_PATH_PREFIX = "/t/";

// Generated codes are six characters without 0/O or 1/I/L
// (generate_inventory_asset_tag()); any letters and digits are accepted, so a
// code entered by hand outside that alphabet still resolves.
const CODE_PATTERN = /^[A-Za-z0-9]{4,16}$/;
// Manufacturer codes (UPC-A/E, EAN-8/13, GTIN-14) and NFC serials as Web NFC
// reports them ("04:a2:3b:..."). Anything else is not a tag.
const BARCODE_PATTERN = /^[0-9]{8,14}$/;
const NFC_SERIAL_PATTERN = /^[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){3,9}$/;

/** The tag URL a label or an NFC tag carries for `code`. */
export function tagUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}${TAG_PATH_PREFIX}${encodeURIComponent(code)}`;
}

/**
 * The candidate values a scanned string could be, one per tag kind. Empty when
 * the string cannot be a tag at all -- including a URL on another host, so a
 * label from another organization's portal never resolves here even if its
 * code happens to exist in this one.
 *
 * `host` is the request host (or `window.location.host`). Without it a URL is
 * accepted on any host, which only the pure unit tests rely on.
 */
export function parseScannedTag(
  input: string,
  options: { host?: string } = {},
): Partial<Record<InventoryTagKind, string>> {
  const scanned = input.trim();
  if (!scanned) return {};

  const code = codeFromTagUrl(scanned, options.host);
  if (code !== undefined) {
    return code ? { asset_tag: code } : {};
  }

  const candidates: Partial<Record<InventoryTagKind, string>> = {};
  if (CODE_PATTERN.test(scanned)) candidates.asset_tag = scanned.toUpperCase();
  if (BARCODE_PATTERN.test(scanned)) candidates.barcode = scanned;
  if (NFC_SERIAL_PATTERN.test(scanned)) candidates.nfc = scanned.toUpperCase();
  return candidates;
}

/**
 * The asset-tag code in a tag URL, `null` for a URL that is not one of ours,
 * or `undefined` when the input is not a URL at all (so the caller goes on to
 * treat it as a bare code). Accepts a path on its own, which is what the
 * resolver route receives.
 */
function codeFromTagUrl(
  scanned: string,
  host: string | undefined,
): string | null | undefined {
  let path: string;
  if (scanned.startsWith("/")) {
    path = scanned;
  } else if (/^https?:\/\//i.test(scanned)) {
    let url: URL;
    try {
      url = new URL(scanned);
    } catch {
      return null;
    }
    if (host && url.host.toLowerCase() !== host.toLowerCase()) return null;
    path = url.pathname;
  } else {
    return undefined;
  }

  // A portal.<domain> host serves the portal at the root and 307s the
  // canonical /portal/t/<code> to /t/<code> (src/proxy.ts), so a URL copied
  // from the address bar there has the short form.
  const prefix = [TAG_PATH_PREFIX, SHORT_TAG_PATH_PREFIX].find((candidate) =>
    path.startsWith(candidate),
  );
  if (!prefix) return null;
  let code: string;
  try {
    code = decodeURIComponent(path.slice(prefix.length).replace(/\/+$/, ""));
  } catch {
    return null;
  }
  return CODE_PATTERN.test(code) ? code.toUpperCase() : null;
}

export type InventoryTagMatch = {
  tagId: string;
  kind: InventoryTagKind;
  value: string;
  /** Null for a pre-printed asset tag not yet bound to an item. */
  item: { id: string; description: string; status: string } | null;
};

/**
 * Every tag the scanned string matches, under the caller's RLS: a session
 * without `inventory:view`, or on another tenant's host, gets an empty list,
 * exactly as if the code did not exist. A barcode can match several items;
 * an asset tag or NFC serial matches at most one.
 *
 * `kinds` narrows the search -- the resolver route passes `["asset_tag"]`,
 * since a URL only ever carries an asset-tag code.
 */
export async function lookupInventoryTag(
  supabase: SupabaseClient<Database>,
  scanned: string,
  options: { host?: string; kinds?: InventoryTagKind[] } = {},
): Promise<{ matches: InventoryTagMatch[]; error: boolean }> {
  const candidates = parseScannedTag(scanned, { host: options.host });
  const clauses = (Object.entries(candidates) as [InventoryTagKind, string][])
    .filter(([kind]) => !options.kinds || options.kinds.includes(kind))
    .map(
      ([kind, value]) =>
        `and(kind.eq.${kind},value.eq.${JSON.stringify(value)})`,
    );
  if (clauses.length === 0) return { matches: [], error: false };

  const { data, error } = await supabase
    .from("inventory_item_tags")
    .select(
      "id, kind, value, item:inventory_items!inventory_item_tags_item_in_tenant(id, description, status)",
    )
    .or(clauses.join(","))
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) return { matches: [], error: true };

  return {
    matches: (data ?? []).map((row) => ({
      tagId: row.id,
      kind: row.kind as InventoryTagKind,
      value: row.value,
      item: row.item,
    })),
    error: false,
  };
}
