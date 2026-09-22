import Papa from "papaparse";
import { utcIsoToDateInZone } from "@/lib/time";

/**
 * Parsing a processor's CSV export into rows `bulk_import_monetary_donations`
 * will accept (#1390). Pure, like `calendar-import-row.ts`: no Supabase
 * client, no React, so the preview panel and the Server Action can run the
 * same code and `donation-import-row.test.ts` can exercise it directly.
 *
 * WHY THIS ONE NEEDS A MAPPING AND THE CALENDAR IMPORT DID NOT. The calendar
 * import owns its own file format -- it tells the operator what to name the
 * columns. Here the file comes out of somebody else's product, and no two
 * providers name anything the same: Stripe's `id`, `amount`, `fee`; Donorbox's
 * `Donation Id`, `Amount`, `Processing Fee`; Zeffy's `Payment ID`, `Total`,
 * with no fee column at all because it passes its cost to the donor. So the
 * tenant maps its own header row onto the six fields below, once, and the
 * mapping is remembered in `giving.import_mapping`.
 */

export const IMPORT_FIELDS = [
  "external_reference",
  "amount",
  "gross_amount",
  "fee_amount",
  "received_at",
  "notes",
] as const;

export type DonationImportField = (typeof IMPORT_FIELDS)[number];

/** The tenant's own header name for each field, where it has chosen one. */
export type DonationImportMapping = Partial<
  Record<DonationImportField, string>
>;

export const IMPORT_FIELD_LABELS: Record<DonationImportField, string> = {
  external_reference: "Transaction ID",
  amount: "Net received",
  gross_amount: "Gross amount",
  fee_amount: "Processor fee",
  received_at: "Date received",
  notes: "Notes",
};

export const IMPORT_FIELD_HINTS: Record<DonationImportField, string> = {
  external_reference:
    "The provider's own id for the transaction. Required — it is what stops a re-import duplicating a gift.",
  amount:
    "What landed in the bank. Leave unmapped if the file only has a gross amount and a fee; we subtract them.",
  gross_amount: "What the donor gave, before the provider's cut. Optional.",
  fee_amount:
    "What the provider kept. Optional — platforms that pass their cost to the donor have no such column.",
  received_at: "When the provider says the gift was made. Required.",
  notes:
    "Anything you want on the row. The donor's name goes here if you map it — the import never creates a person.",
};

/**
 * Required, and required for a reason rather than by convention.
 * `external_reference` is the idempotency key; `received_at` is what the day
 * is computed from. `amount` is not on this list because a file carrying a
 * gross and a fee determines it -- see `resolveAmounts`.
 */
const REQUIRED_FIELDS: readonly DonationImportField[] = [
  "external_reference",
  "received_at",
];

export type DonationImportRow = {
  externalReference: string;
  /** What the organization received. Always present, however it was derived. */
  amount: number;
  grossAmount: number | null;
  feeAmount: number | null;
  /** The provider's instant, as an ISO string. */
  receivedAt: string;
  /**
   * That instant as the organization's own day (#1065). Shown in the preview
   * so the reader sees the date the row will report under; the RPC recomputes
   * it from `receivedAt` rather than trusting this, because a browser clock is
   * not the organization's.
   */
  receivedDate: string;
  notes: string | null;
};

export type DonationImportParseResult =
  { data: DonationImportRow } | { error: string };

/**
 * A provider's money column as a number, or null when the cell is empty.
 *
 * Exports are not tidy: `$1,250.00`, `(4.55)` for a deduction, `1 250,00` from
 * a European locale's spreadsheet. Currency symbols, thousands separators and
 * surrounding whitespace are dropped, accounting-style parentheses are read as
 * the negative they mean (and then refused by the caller, which is the right
 * answer -- a negative gift is a refund, and refunds are out of scope), and
 * anything still unreadable returns `undefined` so the caller can name the
 * column in the error.
 */
export function parseMoney(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const negative = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed
    .replace(/^\((.*)\)$/, "$1")
    .replace(/[$€£¥]/g, "")
    .replace(/,/g, "")
    .replace(/\s/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return undefined;
  return negative ? -value : value;
}

/** Two decimal places, the column's own precision. */
function toCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The three money figures, reconciled.
 *
 * `amount` is what the organization received and is what Income reports, so it
 * has to come out of every shape a provider's file arrives in:
 *
 * - amount alone (Zeffy, Givebutter with tips on: the donor covered the cost)
 * - gross and fee, no amount (Stripe: subtract them)
 * - all three (Donorbox: check they agree, because a file that disagrees with
 *   itself has been edited, and guessing which column to believe is how a
 *   month's figures go quietly wrong)
 * - gross alone: the gross *is* what arrived, since nothing says a fee was
 *   taken
 */
function resolveAmounts(
  amount: number | null,
  gross: number | null,
  fee: number | null,
  rowNumber: number,
):
  | { amount: number; gross: number | null; fee: number | null }
  | { error: string } {
  if (amount === null && gross === null) {
    return {
      error: `row ${rowNumber}: no amount — map a net amount, or a gross amount and a fee`,
    };
  }

  let resolved: number;
  if (amount !== null) {
    resolved = toCents(amount);
  } else if (gross !== null && fee !== null) {
    resolved = toCents(gross - fee);
  } else {
    resolved = toCents(gross as number);
  }

  if (resolved < 0) {
    return {
      error: `row ${rowNumber}: amount is negative — a refund is not an import (delete the gift instead)`,
    };
  }
  if (gross !== null && gross < 0) {
    return { error: `row ${rowNumber}: gross amount is negative` };
  }
  if (fee !== null && fee < 0) {
    return { error: `row ${rowNumber}: fee is negative` };
  }
  if (gross !== null && fee !== null && toCents(gross - fee) !== resolved) {
    return {
      error: `row ${rowNumber}: ${resolved.toFixed(2)} is not ${gross.toFixed(2)} minus ${fee.toFixed(2)}`,
    };
  }

  return {
    amount: resolved,
    gross: gross === null ? null : toCents(gross),
    fee: fee === null ? null : toCents(fee),
  };
}

function cell(
  raw: Record<string, string | undefined>,
  mapping: DonationImportMapping,
  field: DonationImportField,
): string {
  const header = mapping[field];
  if (!header) return "";
  return (raw[header] ?? "").trim();
}

export function parseDonationImportRow(
  raw: Record<string, string | undefined>,
  rowNumber: number,
  mapping: DonationImportMapping,
  timeZone: string,
): DonationImportParseResult {
  const reference = cell(raw, mapping, "external_reference");
  const receivedAtRaw = cell(raw, mapping, "received_at");
  const amountRaw = cell(raw, mapping, "amount");
  const grossRaw = cell(raw, mapping, "gross_amount");
  const feeRaw = cell(raw, mapping, "fee_amount");
  const notes = cell(raw, mapping, "notes");

  // A trailing newline, or a blank line a spreadsheet left behind. Reported
  // rather than silently dropped, so a file that is half blank says so.
  if (!reference && !receivedAtRaw && !amountRaw && !grossRaw && !feeRaw) {
    return { error: `row ${rowNumber}: blank` };
  }

  if (!reference) {
    return { error: `row ${rowNumber}: no transaction ID` };
  }
  if (reference.length > 200) {
    return { error: `row ${rowNumber}: transaction ID is too long` };
  }

  const amount = parseMoney(amountRaw);
  if (amount === undefined) {
    return { error: `row ${rowNumber}: "${amountRaw}" is not an amount` };
  }
  const gross = parseMoney(grossRaw);
  if (gross === undefined) {
    return { error: `row ${rowNumber}: "${grossRaw}" is not a gross amount` };
  }
  const fee = parseMoney(feeRaw);
  if (fee === undefined) {
    return { error: `row ${rowNumber}: "${feeRaw}" is not a fee` };
  }

  const amounts = resolveAmounts(amount, gross, fee, rowNumber);
  if ("error" in amounts) return amounts;

  if (!receivedAtRaw) {
    return { error: `row ${rowNumber}: no date received` };
  }
  const receivedAt = new Date(receivedAtRaw);
  if (Number.isNaN(receivedAt.getTime())) {
    return {
      error: `row ${rowNumber}: "${receivedAtRaw}" isn't a date we can read`,
    };
  }

  return {
    data: {
      externalReference: reference,
      amount: amounts.amount,
      grossAmount: amounts.gross,
      feeAmount: amounts.fee,
      receivedAt: receivedAt.toISOString(),
      receivedDate: utcIsoToDateInZone(receivedAt.toISOString(), timeZone),
      notes: notes || null,
    },
  };
}

export type DonationImportCsv = {
  headers: string[];
  rows: DonationImportParseResult[];
  totalRows: number;
};

/**
 * Whether the mapping can be used at all. Returned rather than thrown so the
 * panel can say which field is missing while the reader is still choosing.
 */
export function mappingError(mapping: DonationImportMapping): string | null {
  for (const field of REQUIRED_FIELDS) {
    if (!mapping[field]) {
      return `Choose which column holds ${IMPORT_FIELD_LABELS[field].toLowerCase()}.`;
    }
  }
  if (!mapping.amount && !mapping.gross_amount) {
    return "Choose which column holds the net received, or map a gross amount and a fee.";
  }
  const chosen = IMPORT_FIELDS.map((field) => mapping[field]).filter(Boolean);
  if (new Set(chosen).size !== chosen.length) {
    return "Two fields are mapped to the same column.";
  }
  return null;
}

/** The header row on its own, for building the mapping pickers. */
export function parseCsvHeaders(csvText: string): string[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    preview: 1,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  return (parsed.meta.fields ?? [])
    .map((field) => field.trim())
    .filter(Boolean);
}

/**
 * A first guess at the mapping, so the common files need no pickers touched.
 *
 * Deliberately conservative: it matches on a small list of names the major
 * exports actually use, and leaves a field unmapped rather than guessing from
 * a partial word. A wrong guess the reader does not notice is worse than an
 * empty picker they have to fill, because the preview would then look right.
 */
const HEADER_GUESSES: Record<DonationImportField, readonly string[]> = {
  external_reference: [
    "id",
    "transaction id",
    "payment id",
    "donation id",
    "charge id",
    "reference",
    "transaction",
  ],
  amount: [
    "net",
    "net amount",
    "amount received",
    "payout amount",
    "net received",
    "converted amount",
  ],
  gross_amount: ["amount", "gross", "gross amount", "total", "donation amount"],
  fee_amount: ["fee", "fees", "processing fee", "platform fee", "amount fee"],
  received_at: [
    "date",
    "created",
    "created (utc)",
    "donation date",
    "date received",
    "paid at",
    "timestamp",
  ],
  // Deliberately no donor-name guess. The import never creates a person, and
  // carrying a donor's name into a note is a retention choice the tenant makes
  // by mapping the column itself -- not one a guess makes for it.
  notes: ["notes", "note", "description", "comment", "memo"],
};

export function guessMapping(
  headers: readonly string[],
): DonationImportMapping {
  const mapping: DonationImportMapping = {};
  const taken = new Set<string>();
  for (const field of IMPORT_FIELDS) {
    const match = headers.find(
      (header) =>
        !taken.has(header) &&
        HEADER_GUESSES[field].includes(header.trim().toLowerCase()),
    );
    if (match) {
      mapping[field] = match;
      taken.add(match);
    }
  }
  return mapping;
}

/** Only the headers the file actually has; a remembered mapping goes stale. */
export function pruneMapping(
  mapping: DonationImportMapping,
  headers: readonly string[],
): DonationImportMapping {
  const pruned: DonationImportMapping = {};
  for (const field of IMPORT_FIELDS) {
    const header = mapping[field];
    if (header && headers.includes(header)) pruned[field] = header;
  }
  return pruned;
}

export function parseDonationImportCsv(
  csvText: string,
  mapping: DonationImportMapping,
  timeZone: string,
): DonationImportCsv {
  // Headers are trimmed on the way in rather than on the way out, so the keys
  // on each row object are the same strings the mapping pickers offer.
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  const headers = (parsed.meta.fields ?? [])
    .map((field) => field.trim())
    .filter(Boolean);
  // Row 1 is the header, so the file's own line numbers start at 2 -- the
  // number the reader will see in their spreadsheet.
  const rows = parsed.data.map((row, index) =>
    parseDonationImportRow(row, index + 2, mapping, timeZone),
  );
  return { headers, rows, totalRows: parsed.data.length };
}
