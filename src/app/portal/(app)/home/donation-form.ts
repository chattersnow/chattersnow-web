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
  }[];
  p_event_id: string | null;
};

export function parseDonationInput(
  input: CreateDonationInput,
): ParseResult<DonationRpcArgs> {
  const donorName = input.donorName.trim();
  if (!input.isAnonymous && !donorName) {
    return {
      error: "Donor name is required unless the donation is anonymous.",
    };
  }
  if (
    !SOURCE_TYPES.includes(input.sourceType as (typeof SOURCE_TYPES)[number])
  ) {
    return { error: "Select a valid donor source." };
  }
  if (!input.items.length) {
    return { error: "Add at least one item to the donation." };
  }

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i];
    const label = `Item ${i + 1}`;
    if (!item.description.trim()) {
      return { error: `${label}: description is required.` };
    }
    if (!item.categoryKey.trim()) {
      return { error: `${label}: category is required.` };
    }
    if (
      item.categoryKey === OTHER_CATEGORY_KEY &&
      !item.categoryDetail?.trim()
    ) {
      return {
        error: `${label}: describe the item when the category is Other.`,
      };
    }
    if (!CONDITIONS.includes(item.condition as (typeof CONDITIONS)[number])) {
      return { error: `${label}: select a valid condition.` };
    }
    if (
      item.faceValue != null &&
      (Number.isNaN(item.faceValue) || item.faceValue < 0)
    ) {
      return { error: `${label}: face value must be a positive number.` };
    }
    if (
      item.intendedUse != null &&
      !INTENDED_USES.includes(
        item.intendedUse as (typeof INTENDED_USES)[number],
      )
    ) {
      return { error: `${label}: select a valid intended use.` };
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
      })),
      p_event_id: input.eventId ?? null,
    },
  };
}
