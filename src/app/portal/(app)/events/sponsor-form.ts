import type { ParseResult } from "@/lib/forms";
import { INTENDED_USES } from "@/lib/inventory";

const SUPPORT_TYPES = ["cash", "in_kind", "both", "other"] as const;
const FOLLOW_UP_STATUSES = ["not_started", "in_progress", "done"] as const;

/** Support types whose contribution is goods rather than money, and so the ones
 *  that carry items. `cash` and `other` never do. */
const ITEM_BEARING_SUPPORT_TYPES = ["in_kind", "both"];

/** One thing the sponsor gave, as the sync RPC expects it. An absent `id` means
 *  a row to create; an id present is only honoured server-side when it already
 *  belongs to this sponsorship's donation. */
export type SponsorItemData = {
  id: string | null;
  description: string;
  face_value: number | null;
  intended_use: string;
};

export type SponsorFormData = {
  support_type: string;
  contribution_value: number | null;
  is_public: boolean;
  notes: string | null;
  follow_up_status: string;
  follow_up_notes: string | null;
  items: SponsorItemData[];
};

/** The shape the client posts under `items`. Every field arrives as a string,
 *  since it comes straight off the inputs. */
type RawItem = {
  id?: unknown;
  description?: unknown;
  faceValue?: unknown;
  intendedUse?: unknown;
};

function parseItems(raw: string): ParseResult<SponsorItemData[]> {
  if (!raw.trim()) return { data: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Could not read the item list. Please try again." };
  }
  if (!Array.isArray(parsed)) {
    return { error: "Could not read the item list. Please try again." };
  }

  const items: SponsorItemData[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = (parsed[i] ?? {}) as RawItem;
    const label = `Item ${i + 1}`;
    const description = String(item.description ?? "").trim();
    const faceValueRaw = String(item.faceValue ?? "").trim();
    const intendedUse = String(item.intendedUse ?? "").trim() || "giveaway";

    // A row the staffer added and left completely blank is dropped rather than
    // rejected -- the list starts with one empty row, so an otherwise cash-only
    // sponsorship would be unsavable.
    if (!description && !faceValueRaw) continue;

    if (!description) {
      return { error: `${label}: description is required.` };
    }

    let faceValue: number | null = null;
    if (faceValueRaw) {
      const value = Number(faceValueRaw);
      if (Number.isNaN(value) || value < 0) {
        return { error: `${label}: value must be a positive number.` };
      }
      faceValue = value;
    }

    if (!INTENDED_USES.some((use) => use.value === intendedUse)) {
      return { error: `${label}: select where the item is headed.` };
    }

    items.push({
      id: String(item.id ?? "").trim() || null,
      description,
      face_value: faceValue,
      intended_use: intendedUse,
    });
  }

  return { data: items };
}

export function parseSponsorForm(
  formData: FormData,
): ParseResult<SponsorFormData> {
  const supportType = String(formData.get("supportType") ?? "in_kind");
  const contributionValueRaw = String(
    formData.get("contributionValue") ?? "",
  ).trim();
  const isPublic =
    formData.get("isPublic") === "on" || formData.get("isPublic") === "true";
  const notes = String(formData.get("notes") ?? "").trim();
  const followUpStatus = String(
    formData.get("followUpStatus") ?? "not_started",
  );
  const followUpNotes = String(formData.get("followUpNotes") ?? "").trim();

  if (!SUPPORT_TYPES.includes(supportType as (typeof SUPPORT_TYPES)[number])) {
    return { error: "Select a valid support type." };
  }
  if (
    !FOLLOW_UP_STATUSES.includes(
      followUpStatus as (typeof FOLLOW_UP_STATUSES)[number],
    )
  ) {
    return { error: "Select a valid follow-up status." };
  }

  let contributionValue: number | null = null;
  if (contributionValueRaw) {
    const parsed = Number(contributionValueRaw);
    if (Number.isNaN(parsed) || parsed < 0) {
      return { error: "Contribution value must be a positive number." };
    }
    contributionValue = parsed;
  }

  const items = parseItems(String(formData.get("items") ?? ""));
  if ("error" in items) return items;

  // Switching a sponsorship to cash-only is how its items are meant to go away,
  // so the items a hidden editor still holds are dropped rather than saved.
  const keepItems = ITEM_BEARING_SUPPORT_TYPES.includes(supportType);

  return {
    data: {
      support_type: supportType,
      contribution_value: contributionValue,
      is_public: isPublic,
      notes: notes || null,
      follow_up_status: followUpStatus,
      follow_up_notes: followUpNotes || null,
      items: keepItems ? items.data : [],
    },
  };
}
