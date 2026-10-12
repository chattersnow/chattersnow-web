import type { ParseResult } from "@/lib/forms";
import {
  DISCOUNT_CODE_KINDS,
  type DiscountCodeKind,
} from "@/lib/portal/impact-metrics";

/** discount_codes_pin_length agrees. */
export const MAX_PIN_LENGTH = 64;

/** One field per option the code covers, named by the option's id (#1589). */
export const PERCENT_OFF_FIELD_PREFIX = "percentOff.";

/** A registration option a code covers, and by what percentage (#1589). */
export type DiscountCodeCoverage = { optionId: string; percentOff: number };

/**
 * What a code pays for and is worth (#1588), and which registration options
 * it covers (#1589). All optional; the Results card derives rental subsidies,
 * participant assistance and the discount value offered from them.
 */
export type DiscountCodeDetails = {
  description: string | null;
  source: string | null;
  kind: DiscountCodeKind | null;
  value: number | null;
  coverage: DiscountCodeCoverage[];
};

export type DiscountCodeEntry = { code: string; pin: string | null };

export type DiscountCodesBatch = DiscountCodeDetails & {
  codes: DiscountCodeEntry[];
};

/** The event's one shared code (#1589). */
export type SharedDiscountCode = DiscountCodeDetails & DiscountCodeEntry;

function isDiscountCodeKind(value: string): value is DiscountCodeKind {
  return DISCOUNT_CODE_KINDS.some((kind) => kind.value === value);
}

function pinError(pin: string): string | null {
  return pin.length > MAX_PIN_LENGTH
    ? `A PIN can be at most ${MAX_PIN_LENGTH} characters.`
    : null;
}

/** Blank is no PIN. */
export function parseDiscountCodePin(
  formData: FormData,
): ParseResult<string | null> {
  const pin = String(formData.get("pin") ?? "").trim();
  const error = pinError(pin);
  if (error) return { error };
  return { data: pin || null };
}

function parseCoverage(
  formData: FormData,
): ParseResult<DiscountCodeCoverage[]> {
  const coverage: DiscountCodeCoverage[] = [];
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith(PERCENT_OFF_FIELD_PREFIX)) continue;
    const text = String(raw).trim();
    if (!text) continue;
    const percent = Number(text);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return { error: "A percentage off must be more than 0 and at most 100." };
    }
    coverage.push({
      optionId: key.slice(PERCENT_OFF_FIELD_PREFIX.length),
      percentOff: Math.round(percent * 100) / 100,
    });
  }
  return { data: coverage };
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

  const coverage = parseCoverage(formData);
  if ("error" in coverage) return coverage;

  return {
    data: {
      description: description || null,
      source: source || null,
      kind: kind ? (kind as DiscountCodeKind) : null,
      value,
      coverage: coverage.data,
    },
  };
}

/**
 * One code per line, as `CODE` or `CODE, PIN` -- comma or tab, so a partner's
 * CSV or a spreadsheet column pair pastes straight in (#1589).
 */
export function parseDiscountCodesForm(
  formData: FormData,
): ParseResult<DiscountCodesBatch> {
  const raw = String(formData.get("codes") ?? "");

  const seen = new Set<string>();
  const codes: DiscountCodeEntry[] = [];
  const lines = raw.split("\n");
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    const fields = line.split(/[,\t]/).map((field) => field.trim());
    if (fields.length > 2) {
      return {
        error: `Line ${index + 1} has more than a code and a PIN. Put one code per line, optionally followed by a comma and its PIN.`,
      };
    }
    const [code, pin = ""] = fields;
    if (!code) {
      return { error: `Line ${index + 1} has a PIN but no code.` };
    }
    const error = pinError(pin);
    if (error) return { error: `Line ${index + 1}: ${error}` };
    const key = code.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    codes.push({ code, pin: pin || null });
  }

  if (codes.length === 0) {
    return { error: "Enter at least one code, one per line." };
  }

  const details = parseDiscountCodeDetails(formData);
  if ("error" in details) return details;

  return { data: { codes, ...details.data } };
}

export function parseSharedDiscountCodeForm(
  formData: FormData,
): ParseResult<SharedDiscountCode> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter the shared code." };
  const pin = parseDiscountCodePin(formData);
  if ("error" in pin) return pin;
  const details = parseDiscountCodeDetails(formData);
  if ("error" in details) return details;
  return { data: { code, pin: pin.data, ...details.data } };
}
