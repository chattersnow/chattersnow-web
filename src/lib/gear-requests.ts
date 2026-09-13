/**
 * The vocabulary of a public gear request (#1032): how it can be delivered,
 * where it stands, and the per-tenant settings that decide what the public
 * form offers and what the confirmation email says.
 *
 * Zero runtime imports on purpose, like `@/lib/notifications/kinds`: the
 * public checkout form, the portal settings panel and the server actions all
 * import this, and none of the client ones may drag a Supabase client into
 * the browser bundle.
 *
 * Money is never platform vocabulary here. Chatter Snow takes Zelle and Venmo
 * for postage; that is two rows in its `gear_requests.payment_methods`
 * setting, and the next tenant configures whatever it accepts.
 */

export const SHIPPING_ENABLED_SETTING_KEY = "gear_requests.shipping_enabled";
export const PAYMENT_METHODS_SETTING_KEY = "gear_requests.payment_methods";
export const MEETUP_INSTRUCTIONS_SETTING_KEY =
  "gear_requests.meetup_instructions";
export const SHIPPING_INSTRUCTIONS_SETTING_KEY =
  "gear_requests.shipping_instructions";

export type DeliveryMethod = "meetup" | "shipping";

export const DELIVERY_METHODS: readonly {
  value: DeliveryMethod;
  label: string;
  description: string;
}[] = [
  {
    value: "meetup",
    label: "Meet up in person",
    description: "We'll arrange a time and place to hand it over.",
  },
  {
    value: "shipping",
    label: "Ship it to me",
    description:
      "You cover the postage. We'll weigh the package, send you the amount, and post it once it's paid.",
  },
];

export function isDeliveryMethod(value: string): value is DeliveryMethod {
  return DELIVERY_METHODS.some((method) => method.value === value);
}

export function deliveryMethodLabel(value: string): string {
  return (
    DELIVERY_METHODS.find((method) => method.value === value)?.label ?? value
  );
}

export type GearRequestStatus =
  "new" | "quoted" | "paid" | "fulfilled" | "cancelled";

export const GEAR_REQUEST_STATUSES: readonly {
  value: GearRequestStatus;
  label: string;
}[] = [
  { value: "new", label: "New" },
  { value: "quoted", label: "Quoted" },
  { value: "paid", label: "Paid" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "cancelled", label: "Cancelled" },
];

export function isGearRequestStatus(value: string): value is GearRequestStatus {
  return GEAR_REQUEST_STATUSES.some((status) => status.value === value);
}

export function gearRequestStatusLabel(value: string): string {
  return (
    GEAR_REQUEST_STATUSES.find((status) => status.value === value)?.label ??
    value
  );
}

/** Fulfilled and cancelled are terminal: set_gear_request_status() refuses both. */
export function isOpenGearRequest(status: string): boolean {
  return status !== "fulfilled" && status !== "cancelled";
}

/**
 * One way a tenant accepts postage payment, as stored in
 * `gear_requests.payment_methods`. `key` is what a request records and what
 * the public form submits; `label` is what the requester sees; `handle` and
 * `instructions` reach only the confirmation email, after someone has asked.
 */
export type PaymentMethod = {
  key: string;
  label: string;
  handle: string;
  instructions: string;
};

/** What the public form is told: the key and the label, nothing else. */
export type PaymentMethodOption = { key: string; label: string };

export type GearRequestSettings = {
  shippingEnabled: boolean;
  paymentMethods: PaymentMethod[];
  meetupInstructions: string;
  shippingInstructions: string;
};

export const DEFAULT_GEAR_REQUEST_SETTINGS: GearRequestSettings = {
  shippingEnabled: false,
  paymentMethods: [],
  meetupInstructions: "",
  shippingInstructions: "",
};

export const MAX_PAYMENT_METHODS = 6;
export const MAX_PAYMENT_METHOD_LABEL_LENGTH = 60;
export const MAX_PAYMENT_METHOD_HANDLE_LENGTH = 120;
export const MAX_PAYMENT_METHOD_INSTRUCTIONS_LENGTH = 1000;
export const MAX_DELIVERY_INSTRUCTIONS_LENGTH = 2000;

/** The same rule set_gear_request_settings() enforces on a method's key. */
export const PAYMENT_METHOD_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,49}$/;

/**
 * A key from a label: "Zelle" -> "zelle", "Cash App" -> "cash-app". The key
 * is what a request stores, so it must not change when the label is edited;
 * the panel derives it once, when the method is added.
 */
export function paymentMethodKeyFor(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Tolerant: a malformed entry is dropped rather than failing the whole read. */
export function parsePaymentMethods(value: unknown): PaymentMethod[] {
  if (!Array.isArray(value)) return [];
  const methods: PaymentMethod[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const key = asString(record.key);
    const label = asString(record.label).trim();
    if (!PAYMENT_METHOD_KEY_PATTERN.test(key) || !label || seen.has(key))
      continue;
    seen.add(key);
    methods.push({
      key,
      label,
      handle: asString(record.handle).trim(),
      instructions: asString(record.instructions).trim(),
    });
  }
  return methods;
}

/** The shape get_gear_request_settings() returns, made safe to render. */
export function parseGearRequestSettings(value: unknown): GearRequestSettings {
  if (!value || typeof value !== "object") return DEFAULT_GEAR_REQUEST_SETTINGS;
  const record = value as Record<string, unknown>;
  return {
    shippingEnabled: record.shipping_enabled === true,
    paymentMethods: parsePaymentMethods(record.payment_methods),
    meetupInstructions: asString(record.meetup_instructions),
    shippingInstructions: asString(record.shipping_instructions),
  };
}

export type PublicGearRequestOptions = {
  shippingEnabled: boolean;
  paymentMethods: PaymentMethodOption[];
};

export const DEFAULT_PUBLIC_GEAR_REQUEST_OPTIONS: PublicGearRequestOptions = {
  shippingEnabled: false,
  paymentMethods: [],
};

/** The `public_gear_request_settings` view's two rows, resolved. */
export function resolvePublicGearRequestOptions(
  rows: readonly { slot: string; value: unknown }[],
): PublicGearRequestOptions {
  const bySlot = new Map(rows.map((row) => [row.slot, row.value]));
  return {
    shippingEnabled: bySlot.get("shipping_enabled") === true,
    paymentMethods: parsePaymentMethods(bySlot.get("payment_methods")).map(
      ({ key, label }) => ({ key, label }),
    ),
  };
}

export type ShippingAddress = {
  name: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
};

/** The address as postal lines, blanks dropped. Empty for a meetup. */
export function shippingAddressLines(address: ShippingAddress): string[] {
  const cityLine = [address.city, address.region]
    .filter((part) => part && part.trim())
    .join(", ");
  const cityAndPostal = [cityLine, address.postal_code]
    .filter((part) => part && part.trim())
    .join(" ");
  return [
    address.name,
    address.line1,
    address.line2,
    cityAndPostal,
    address.country,
  ].filter((line): line is string => Boolean(line && line.trim()));
}
