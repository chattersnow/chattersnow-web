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

export type MonetaryDonationRow = {
  id: string;
  donor_id: string | null;
  event_id: string | null;
  amount: number | string;
  method: PaymentMethod;
  received_date: string;
  notes: string | null;
  people: { name: string | null } | null;
  events: { name: string } | null;
};

export type EventOption = { id: string; name: string };

export const DONATION_COLUMNS =
  "id, donor_id, event_id, amount, method, received_date, notes, people(name), events(name)";

export const ANONYMOUS_DONOR_LABEL = "Anonymous";

export function donorLabel(row: MonetaryDonationRow): string {
  if (!row.donor_id) return ANONYMOUS_DONOR_LABEL;
  return row.people?.name?.trim() || "—";
}
