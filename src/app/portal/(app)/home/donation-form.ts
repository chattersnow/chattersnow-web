import type { ParseResult } from "@/lib/forms";
import { OTHER_CATEGORY_KEY } from "@/lib/inventory";

export type DonationItemInput = {
  description: string;
  size?: string;
  /** Controlled category key (issue #667). */
  categoryKey: string;
  /** Free-text detail, required only when the category is "Other". */
  categoryDetail?: string;
  gender?: string;
  condition: string;
  faceValue?: number | null;
  notes?: string;
  intendedUse?: string;
  /** Tier key (e.g. "gold") when the staffer picks one; otherwise the
   *  giveaway's keyword hints suggest it server-side. */
  giveawayTier?: string;
  /** Full URL of the item's photo (issue #781) -- a gear-photos object uploaded
   *  from the device, or a pasted external link. */
  photoUrl?: string;
  /** A pre-printed blank label scanned at intake (#1420), bound to the item
   *  instead of generating a code. Absent, the item gets a new code. */
  assetTag?: string;
  /** A manufacturer UPC/EAN read off the item as it arrived (#1420). */
  barcode?: string;
};

export type CreateDonationInput = {
  isAnonymous: boolean;
  donorName: string;
  donorEmail?: string;
  donorPhone?: string;
  sourceType: string;
  donorNotes?: string;
  items: DonationItemInput[];
  eventId?: string;
  /** The day the gear arrived, "YYYY-MM-DD", read in the browser's timezone
   *  (`todayInBrowser`). Absent falls back to the database's `current_date`,
   *  which is a day ahead for an evening intake west of Greenwich (#1053). */
  donatedOn?: string;
};

const SOURCE_TYPES = [
  "individual",
  "brand",
  "organization",
  "event",
  "other",
] as const;
const CONDITIONS = ["new", "like_new", "good", "fair", "poor"] as const;
const INTENDED_USES = ["gear_library", "giveaway", "internal"] as const;
// The shapes parseScannedTag (src/lib/inventory-tags.ts) accepts as a bare
// code and as a manufacturer barcode.
const ASSET_TAG_PATTERN = /^[A-Za-z0-9]{4,16}$/;
const BARCODE_PATTERN = /^[0-9]{8,14}$/;

export type DonationRpcArgs = {
  p_donor_name: string | null;
  p_donor_is_anonymous: boolean;
  p_donor_source_type: string;
  p_donor_email: string | null;
  p_donor_phone: string | null;
  p_donor_notes: string | null;
  p_items: {
    description: string;
    size: string | null;
    category_key: string;
    type: string | null;
    gender: string | null;
    condition: string;
    face_value: number | null;
    notes: string | null;
    intended_use: string;
    giveaway_tier: string | null;
    photo_url: string | null;
    asset_tag: string | null;
    barcode: string | null;
  }[];
  p_event_id: string | null;
  p_donated_at: string | null;
};

export function parseDonationInput(
  input: CreateDonationInput,
): ParseResult<DonationRpcArgs> {
  const donorName = input.donorName.trim();
  if (!input.isAnonymous && !donorName) {
    return {
      error: "Donor name is required unless the donation is anonymous.",
      field: "donorName",
    };
  }
  if (
    !SOURCE_TYPES.includes(input.sourceType as (typeof SOURCE_TYPES)[number])
  ) {
    return { error: "Select a valid donor source.", field: "sourceType" };
  }
  if (!input.items.length) {
    return { error: "Add at least one item to the donation.", field: "items" };
  }

  const assetTags = new Set<string>();
  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    const label = `Item ${i + 1}`;
    // Also a check constraint since #1122 (inventory_items_description_not_blank):
    // create_donation_with_items is reachable over PostgREST without this
    // parser, and an item nothing names is a row nobody can act on.
    if (!item.description.trim()) {
      return {
        error: `${label}: description is required.`,
        field: `items.${i}.description`,
      };
    }
    if (!item.categoryKey.trim()) {
      return {
        error: `${label}: category is required.`,
        field: `items.${i}.categoryKey`,
      };
    }
    if (
      item.categoryKey === OTHER_CATEGORY_KEY &&
      !item.categoryDetail?.trim()
    ) {
      return {
        error: `${label}: describe the item when the category is Other.`,
        field: `items.${i}.categoryDetail`,
      };
    }
    if (!CONDITIONS.includes(item.condition as (typeof CONDITIONS)[number])) {
      return {
        error: `${label}: select a valid condition.`,
        field: `items.${i}.condition`,
      };
    }
    if (
      item.faceValue != null &&
      (Number.isNaN(item.faceValue) || item.faceValue < 0)
    ) {
      return {
        error: `${label}: face value must be a positive number.`,
        field: `items.${i}.faceValue`,
      };
    }
    if (
      item.intendedUse != null &&
      !INTENDED_USES.includes(
        item.intendedUse as (typeof INTENDED_USES)[number],
      )
    ) {
      return {
        error: `${label}: select a valid intended use.`,
        field: `items.${i}.intendedUse`,
      };
    }
    // Same rule as `events.flier_url`'s check constraint, applied here because
    // an unvalidated value ends up in next/image's `new URL()` at render, which
    // throws and takes the whole page down. The RPC re-checks it (20260907170000)
    // since it is reachable over PostgREST without going through this parser.
    if (item.photoUrl?.trim() && !/^https?:\/\//i.test(item.photoUrl.trim())) {
      return {
        error: `${label}: the photo link must start with http:// or https://.`,
        field: `items.${i}.photoUrl`,
      };
    }
    const assetTag = item.assetTag?.trim().toUpperCase();
    if (assetTag) {
      if (!ASSET_TAG_PATTERN.test(assetTag)) {
        return {
          error: `${label}: “${assetTag}” is not a label code.`,
          field: `items.${i}.assetTag`,
        };
      }
      // One label, one piece. The RPC refuses the second bind too, but only
      // after the first item is written; this names the item.
      if (assetTags.has(assetTag)) {
        return {
          error: `${label}: label ${assetTag} is already on another item.`,
          field: `items.${i}.assetTag`,
        };
      }
      assetTags.add(assetTag);
    }
    if (item.barcode?.trim() && !BARCODE_PATTERN.test(item.barcode.trim())) {
      return {
        error: `${label}: a barcode is 8 to 14 digits.`,
        field: `items.${i}.barcode`,
      };
    }
  }

  return {
    data: {
      p_donor_name: input.isAnonymous ? null : donorName,
      p_donor_is_anonymous: input.isAnonymous,
      p_donor_source_type: input.sourceType,
      p_donor_email: input.donorEmail?.trim() || null,
      p_donor_phone: input.donorPhone?.trim() || null,
      p_donor_notes: input.donorNotes?.trim() || null,
      p_items: input.items.map((item) => ({
        description: item.description.trim(),
        size: item.size?.trim() || null,
        category_key: item.categoryKey.trim(),
        type: item.categoryDetail?.trim() || null,
        gender: item.gender || null,
        condition: item.condition,
        face_value: item.faceValue ?? null,
        notes: item.notes?.trim() || null,
        intended_use: item.intendedUse || "gear_library",
        giveaway_tier: item.giveawayTier?.trim() || null,
        photo_url: item.photoUrl?.trim() || null,
        asset_tag: item.assetTag?.trim().toUpperCase() || null,
        barcode: item.barcode?.trim() || null,
      })),
      p_event_id: input.eventId ?? null,
      p_donated_at: input.donatedOn?.trim() || null,
    },
  };
}
