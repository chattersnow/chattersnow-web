import type { ParseResult } from "@/lib/forms";

export type DiscountCodesBatch = {
  codes: string[];
  description: string | null;
  source: string | null;
};

export function parseDiscountCodesForm(
  formData: FormData,
): ParseResult<DiscountCodesBatch> {
  const raw = String(formData.get("codes") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();

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

  return {
    data: {
      codes,
      description: description || null,
      source: source || null,
    },
  };
}
