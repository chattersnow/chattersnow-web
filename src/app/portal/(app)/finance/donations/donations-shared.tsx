export type PaymentMethod =
  "cash" | "check" | "card" | "bank_transfer" | "online" | "other";

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "cash",
  "check",
  "card",
  "bank_transfer",
  "online",
  "other",
];

export function isPaymentMethod(
  value: string | undefined,
): value is PaymentMethod {
  return !!value && (PAYMENT_METHODS as readonly string[]).includes(value);
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  check: "Check",
  card: "Card",
  bank_transfer: "Bank transfer",
  online: "Online",
  other: "Other",
};

export function paymentMethodLabel(method: PaymentMethod): string {
  return METHOD_LABELS[method] ?? method;
}

/**
 * How a row got here (#1390). `manual` is somebody typing; `import` is a
 * processor's CSV; `processor` is reserved for a live integration and nothing
 * writes it yet -- it is in the database's check constraint already so adding
 * one is not another migration against an audited table.
 */
export type DonationSource = "manual" | "import" | "processor";

export const DONATION_SOURCES: readonly DonationSource[] = [
  "manual",
  "import",
  "processor",
];

export function isDonationSource(
  value: string | undefined,
): value is DonationSource {
  return !!value && (DONATION_SOURCES as readonly string[]).includes(value);
}

const SOURCE_LABELS: Record<DonationSource, string> = {
  manual: "Entered here",
  import: "Imported",
  processor: "From the provider",
};

export function donationSourceLabel(source: DonationSource): string {
  return SOURCE_LABELS[source] ?? source;
}

/**
 * Whether the row's figures came from somewhere else and so are not the
 * portal's to edit. A mistake in an import is a delete and a re-import, the
 * same call the sales register made (docs/spec/finance.md 5.22): editing one
 * side of a reconciliation silently unreconciles it.
 */
export function isImportedDonation(row: {
  source?: DonationSource | null;
}): boolean {
  return row.source === "import" || row.source === "processor";
}

export type MonetaryDonationRow = {
  id: string;
  donor_id: string | null;
  event_id: string | null;
  amount: number | string;
  method: PaymentMethod;
  received_date: string;
  notes: string | null;
  source: DonationSource;
  external_reference: string | null;
  processor_label: string | null;
  gross_amount: number | string | null;
  fee_amount: number | string | null;
  people: { name: string | null } | null;
  events: { name: string } | null;
};

export type EventOption = { id: string; name: string };

export const DONATION_COLUMNS =
  "id, donor_id, event_id, amount, method, received_date, notes, source, external_reference, processor_label, gross_amount, fee_amount, people(name), events(name)";

export const ANONYMOUS_DONOR_LABEL = "Anonymous";

export function donorLabel(row: MonetaryDonationRow): string {
  if (!row.donor_id) return ANONYMOUS_DONOR_LABEL;
  return row.people?.name?.trim() || "—";
}
