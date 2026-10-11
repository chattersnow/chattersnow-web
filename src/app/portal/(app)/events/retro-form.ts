import type { ParseResult } from "@/lib/forms";

/** The three columns of a retro (#1578). */
export const RETRO_KINDS = ["went_well", "improve", "action"] as const;
export type RetroKind = (typeof RETRO_KINDS)[number];

export const RETRO_KIND_LABELS: Record<RetroKind, string> = {
  went_well: "Went well",
  improve: "To improve",
  action: "Action items",
};

/**
 * What an item is about: the Report card's computed sections (#1576), so an
 * item can be read beside the numbers it explains.
 */
export const RETRO_AREAS = [
  "money",
  "goods",
  "sponsors",
  "team",
  "guests",
  "operations",
] as const;
export type RetroArea = (typeof RETRO_AREAS)[number];

export const RETRO_AREA_LABELS: Record<RetroArea, string> = {
  money: "Money",
  goods: "Goods",
  sponsors: "Sponsors",
  team: "Team",
  guests: "Guests",
  operations: "Operations",
};

export const RETRO_BODY_MAX = 2000;

export type RetroItemFormData = {
  kind: RetroKind;
  body: string;
  area: RetroArea | null;
  /** Action items only; always null for the other kinds. */
  ownerPersonId: string | null;
};

function isOneOf<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  return (values as readonly string[]).includes(value);
}

export function parseRetroItemForm(
  formData: FormData,
): ParseResult<RetroItemFormData> {
  const kind = String(formData.get("kind") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const owner = String(formData.get("ownerPersonId") ?? "").trim();

  if (!isOneOf(RETRO_KINDS, kind)) return { error: "Choose a kind of item." };
  if (!body) return { error: "Write the item." };
  if (body.length > RETRO_BODY_MAX) {
    return { error: `Keep the item under ${RETRO_BODY_MAX} characters.` };
  }
  if (area && !isOneOf(RETRO_AREAS, area)) {
    return { error: "Choose an area from the list." };
  }

  return {
    data: {
      kind,
      body,
      area: area ? (area as RetroArea) : null,
      ownerPersonId: kind === "action" && owner ? owner : null,
    },
  };
}
