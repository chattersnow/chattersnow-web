import type { ParseResult } from "@/lib/forms";

const STATUSES = ["active", "pilot", "retired"] as const;

export type ProgramFormData = {
  name: string;
  description: string | null;
  status: (typeof STATUSES)[number];
  /** Whether the public Programs page lists this program (#898). */
  isPublic: boolean;
  pillar: string | null;
  emoji: string | null;
  sortOrder: number | null;
};

export function parseProgramForm(
  formData: FormData,
): ParseResult<ProgramFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  const pillar = String(formData.get("pillar") ?? "").trim();
  const emoji = String(formData.get("emoji") ?? "").trim();
  const sortOrder = String(formData.get("sort_order") ?? "").trim();

  if (!name) return { error: "Program name is required." };
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return { error: "Select a valid status." };
  }

  // Blank is "no order", not zero: the column is nullable and the public page
  // sorts nulls last, so an operator who ordered nothing gets alphabetical.
  let parsedSortOrder: number | null = null;
  if (sortOrder) {
    parsedSortOrder = Number(sortOrder);
    if (!Number.isInteger(parsedSortOrder)) {
      return { error: "Order must be a whole number." };
    }
  }

  return {
    data: {
      name,
      description: description || null,
      status: status as (typeof STATUSES)[number],
      isPublic: formData.get("is_public") === "true",
      pillar: pillar || null,
      emoji: emoji || null,
      sortOrder: parsedSortOrder,
    },
  };
}
