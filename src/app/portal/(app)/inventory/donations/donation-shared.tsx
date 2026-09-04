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
  type: string;
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
