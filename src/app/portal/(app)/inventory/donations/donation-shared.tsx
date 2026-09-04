import { flattenCategory } from "@/lib/inventory";
import {
  CONDITIONS,
  GENDERS,
  INTENDED_USES,
  formatFaceValue,
  labelFor,
} from "../items/inventory-shared";

export { CONDITIONS, GENDERS, INTENDED_USES, formatFaceValue, labelFor };

export const SOURCE_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "brand", label: "Brand" },
  { value: "organization", label: "Organization" },
  { value: "event", label: "Event" },
  { value: "other", label: "Other" },
];

export type DonationItemRow = {
  id: string;
  description: string;
  /** Legacy free text / the "Other" category's detail -- see categoryLabelFor. */
  type: string | null;
  category_id: string | null;
  category_key: string | null;
  category_label: string | null;
  /**
   * Present only on the raw query result, before withFlatItemCategories folds
   * it into category_key/category_label.
   */
  inventory_categories?: { key: string; label: string } | null;
  size: string | null;
  gender: string | null;
  condition: string;
  face_value: number | string | null;
  status: string;
  intended_use: string;
  photo_url: string | null;
  notes: string | null;
};

export type DonationRow = {
  id: string;
  donated_at: string;
  notes: string | null;
  event_id: string | null;
  donor: {
    id: string;
    name: string | null;
    is_anonymous: boolean;
    source_type: string;
  };
  event: { id: string; name: string } | null;
  inventory_items: DonationItemRow[];
};

export function donorLabel(donor: DonationRow["donor"]) {
  return donor.is_anonymous ? "Anonymous" : donor.name || "—";
}

export function donatedAtInputValue(donatedAt: string) {
  return donatedAt.slice(0, 10);
}

/**
 * Normalizes the embedded `inventory_categories` on each of a donation's items
 * into the flat `category_key` / `category_label` fields every render site
 * expects (issue #667).
 */
export function withFlatItemCategories(donation: DonationRow): DonationRow {
  return {
    ...donation,
    inventory_items: (donation.inventory_items ?? []).map((item) =>
      flattenCategory(item),
    ) as DonationItemRow[],
  };
}
