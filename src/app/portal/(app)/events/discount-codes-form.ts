import type { ParseResult } from "@/lib/forms";
import {
  DISCOUNT_CODE_KINDS,
  type DiscountCodeKind,
} from "@/lib/portal/impact-metrics";

/**
 * What a code pays for and is worth (#1588). Both optional; the Results card
 * derives rental subsidies and participant assistance from them.
 */
export type DiscountCodeDetails = {
  description: string | null;
  source: string | null;
  kind: DiscountCodeKind | null;
  value: number | null;
};

export type DiscountCodesBatch = DiscountCodeDetails & {
  codes: string[];
};

function isDiscountCodeKind(value: string): value is DiscountCodeKind {
  return DISCOUNT_CODE_KINDS.some((kind) => kind.value === value);
}

export function parseDiscountCodeDetails(
  formData: FormData,
): ParseResult<DiscountCodeDetails> {
  const description = String(formData.get("description") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim();
  const valueRaw = String(formData.get("value") ?? "").trim();

  if (kind && !isDiscountCodeKind(kind)) {
    return { error: "Choose what the code is for from the list." };
  }

  let value: number | null = null;
  if (valueRaw) {
    const parsed = Number(valueRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { error: "Value must be a positive amount." };
    }
    value = Math.round(parsed * 100) / 100;
  }

  return {
    data: {
      description: description || null,
      source: source || null,
      kind: kind ? (kind as DiscountCodeKind) : null,
      value,
    },
  };
}

export function parseDiscountCodesForm(
  formData: FormData,
): ParseResult<DiscountCodesBatch> {
  const raw = String(formData.get("codes") ?? "");

  const seen = new Set<string>();
  const codes: string[] = [];
  for (const line of raw.split("\n")) {
    const code = line.trim();
    if (!code) continue;
    const key = code.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    codes.push(code);
  }

  if (codes.length === 0) {
    return { error: "Enter at least one code, one per line." };
  }

  const details = parseDiscountCodeDetails(formData);
  if ("error" in details) return details;

  return { data: { codes, ...details.data } };
}
