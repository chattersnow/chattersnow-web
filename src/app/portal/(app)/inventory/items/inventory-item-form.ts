import type { ParseResult } from "@/lib/forms";

const CONDITIONS = ["new", "like_new", "good", "fair", "poor"] as const;
const STATUSES = ["available", "distributed", "damaged", "lost", "retired", "other"] as const;

export type InventoryItemFormData = {
  description: string;
  type: string;
  size: string | null;
  gender: string | null;
  condition: string;
  face_value: number | null;
  status: string;
  photo_url: string | null;
  notes: string | null;
};

export function parseInventoryItemForm(formData: FormData): ParseResult<InventoryItemFormData> {
  const description = String(formData.get("description") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const condition = String(formData.get("condition") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!description) {
    return { error: "Item description is required." };
  }
  if (!type) {
    return { error: "Item type is required." };
  }
  if (!CONDITIONS.includes(condition as (typeof CONDITIONS)[number])) {
    return { error: "Select a valid item condition." };
  }
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return { error: "Select a valid item status." };
  }

  const faceValueRaw = formData.get("faceValue");
  const faceValue = faceValueRaw ? Number(faceValueRaw) : null;
  if (faceValueRaw && (Number.isNaN(faceValue) || (faceValue as number) < 0)) {
    return { error: "Face value must be a positive number." };
  }

  return {
    data: {
      description,
      type,
      size: String(formData.get("size") ?? "").trim() || null,
      gender: String(formData.get("gender") ?? "") || null,
      condition,
      face_value: faceValue,
      status,
      photo_url: String(formData.get("photoUrl") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  };
}
