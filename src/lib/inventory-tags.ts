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

export type InventoryTagKind = "asset_tag" | "barcode" | "nfc" | "numbered";

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
// A reusable numbered code (#1444) as a person types it: `7`, `007`, `CSN-7`,
// `csn007` or `CSN-007`. Mirrors inventory_numbered_tag_number() in SQL. In a
// tag URL it is always the printed form, with its hyphen, which is how a URL
// tells it from a random code: the random alphabet has no hyphen.
const NUMBERED_PATTERN = /^(?:([A-Za-z]{3})\s*-?\s*)?0*([0-9]{1,6})$/;
const NUMBERED_URL_PATTERN = /^[A-Za-z]{3}-[0-9]{1,7}$/;

export type NumberedTag = { prefix: string | null; number: number };

/**
 * The number (and prefix, if one was typed) of a numbered code, or null when
 * the input can't be one. Whether the prefix is this tenant's is for the
 * lookup to say.
 */
export function parseNumberedTag(input: string): NumberedTag | null {
  const match = NUMBERED_PATTERN.exec(input.trim());
  if (!match) return null;
  const number = Number(match[2]);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return { prefix: match[1]?.toUpperCase() ?? null, number };
}

/** `CSN-007` for 7, `CSN-1000` for 1000 -- the printed form. */
export function formatNumberedTag(prefix: string, number: number): string {
  return `${prefix}-${String(number).padStart(3, "0")}`;
}

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
    if (!code) return {};
    return NUMBERED_URL_PATTERN.test(code)
      ? { numbered: code }
      : { asset_tag: code };
  }

  const candidates: Partial<Record<InventoryTagKind, string>> = {};
  if (CODE_PATTERN.test(scanned)) candidates.asset_tag = scanned.toUpperCase();
  if (parseNumberedTag(scanned)) candidates.numbered = scanned.toUpperCase();
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
  return CODE_PATTERN.test(code) || NUMBERED_URL_PATTERN.test(code)
    ? code.toUpperCase()
    : null;
}

export type InventoryTagMatch = {
  tagId: string;
  kind: InventoryTagKind;
  value: string;
  /** Null for a pre-printed asset tag not yet bound to an item, or a free
   *  numbered code. */
  item: { id: string; description: string; status: string } | null;
};

/**
 * Every tag the scanned string matches, under the caller's RLS: a session
 * without `inventory:view`, or on another tenant's host, gets an empty list,
 * exactly as if the code did not exist. A barcode can match several items;
 * an asset tag or NFC serial matches at most one.
 *
 * `kinds` narrows the search -- the resolver route passes the two kinds a
 * URL can carry, `asset_tag` and `numbered`. A numbered code is matched by
 * its number, and a prefix typed with it must be the one on the code.
 *
 * A retired code (#1450) matches nothing: its tag was damaged or lost, so
 * whatever was scanned is not that tag, and it answers as an unknown code.
 */
export async function lookupInventoryTag(
  supabase: SupabaseClient<Database>,
  scanned: string,
  options: { host?: string; kinds?: InventoryTagKind[] } = {},
): Promise<{ matches: InventoryTagMatch[]; error: boolean }> {
  const candidates = parseScannedTag(scanned, { host: options.host });
  const wanted = (
    Object.entries(candidates) as [InventoryTagKind, string][]
  ).filter(([kind]) => !options.kinds || options.kinds.includes(kind));
  const numbered = wanted.some(([kind]) => kind === "numbered")
    ? parseNumberedTag(candidates.numbered ?? "")
    : null;
  const clauses = wanted.map(([kind, value]) =>
    kind === "numbered"
      ? `and(kind.eq.numbered,number.eq.${numbered?.number ?? 0})`
      : `and(kind.eq.${kind},value.eq.${JSON.stringify(value)})`,
  );
  if (clauses.length === 0) return { matches: [], error: false };

  const { data, error } = await supabase
    .from("inventory_item_tags")
    .select(
      "id, kind, value, item:inventory_items!inventory_item_tags_item_in_tenant(id, description, status)",
    )
    .or(clauses.join(","))
    .is("retired_at", null)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) return { matches: [], error: true };

  return {
    matches: (data ?? [])
      .filter(
        (row) =>
          row.kind !== "numbered" ||
          !numbered?.prefix ||
          row.value.startsWith(`${numbered.prefix}-`),
      )
      .map((row) => ({
        tagId: row.id,
        kind: row.kind as InventoryTagKind,
        value: row.value,
        item: row.item,
      })),
    error: false,
  };
}

/**
 * The current tenant's numbered-code prefix (#1444), e.g. `CSN`, or null
 * before one is set.
 */
export async function getInventoryTagPrefix(
  supabase: SupabaseClient<Database>,
): Promise<string | null> {
  return (await getInventoryTagSettings(supabase)).prefix;
}

/**
 * How the current tenant labels its inventory: its numbered-code prefix
 * (#1444), and whether it uses numbered codes only (#1541) -- intake leaves
 * an item with nothing scanned untagged, and the portal offers no random
 * asset-tag codes. Off, and no prefix, when the tenant can't be read.
 */
export async function getInventoryTagSettings(
  supabase: SupabaseClient<Database>,
): Promise<{ prefix: string | null; numberedOnly: boolean }> {
  const { data: tenantId } = await supabase.rpc("current_tenant_id");
  if (!tenantId) return { prefix: null, numberedOnly: false };
  const { data } = await supabase
    .from("tenants")
    .select("inventory_tag_prefix, inventory_numbered_codes_only")
    .eq("id", tenantId)
    .maybeSingle();
  return {
    prefix: data?.inventory_tag_prefix ?? null,
    numberedOnly: data?.inventory_numbered_codes_only ?? false,
  };
}

/** A numbered code a handout freed (#1444), and the item it came off. */
export type ReleasedTag = { code: string; description: string };

/**
 * What to tell whoever just handed gear out: the tags to take off it, since
 * each code is free for the next item now. Null when no numbered code came
 * off.
 */
export function removeTagsMessage(tags: readonly ReleasedTag[]): string | null {
  if (tags.length === 0) return null;
  if (tags.length === 1) {
    return `Remove tag ${tags[0].code} from ${tags[0].description} before it goes out.`;
  }
  return `Remove these tags before the gear goes out: ${tags
    .map((tag) => `${tag.code} from ${tag.description}`)
    .join(", ")}.`;
}

/**
 * The released tags as record_distribution_draft() (jsonb) and
 * released_numbered_inventory_tags() (rows) return them, read defensively.
 */
export function toReleasedTags(raw: unknown): ReleasedTag[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const code = (entry as { code?: unknown })?.code;
    const description = (entry as { description?: unknown })?.description;
    return typeof code === "string" && typeof description === "string"
      ? [{ code, description }]
      : [];
  });
}
