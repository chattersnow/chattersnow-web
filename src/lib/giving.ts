/**
 * The vocabulary of a tenant's giving path (#1389): where an online gift is
 * actually made, how that destination is reached, and what the public page
 * may say around it.
 *
 * Zero runtime imports on purpose, exactly like `@/lib/gear-requests`: the
 * public Give card, the `/support/donate` redirect, the portal settings panel
 * and the server action all import this, and none of the client ones may drag
 * a Supabase client into the browser bundle.
 *
 * Money is never platform vocabulary here, and neither is a processor. Every
 * candidate a tenant might pick -- Zeffy, Givebutter, Donorbox, a Stripe
 * Payment Link, PayPal, Every.org, a fiscal sponsor's own page -- hosts the
 * giving form itself and hands out a URL, so the platform stores a URL and a
 * free-text label for it. There is deliberately no enum of blessed vendors:
 * the label only ever renders as "opens on {label}", and the organization is
 * the merchant of record in every case. Coven never holds donor funds, which
 * is what keeps money transmission, PCI and 1099 exposure off the platform
 * entity.
 *
 * What a gift is worth at tax time is not here either, and cannot be: an
 * organization whose exemption is pending, one operating under a fiscal
 * sponsor and one holding its own determination letter each have a different
 * true sentence, and none of them is the platform's to write
 * (`docs/legal-basis.md` rule 1). That sentence is a Site Content slot,
 * `support.giving_tax_note`, and it ships empty.
 */

export const GIVING_ENABLED_SETTING_KEY = "giving.enabled";
export const GIVING_PROVIDER_LABEL_SETTING_KEY = "giving.provider_label";
export const GIVING_URL_SETTING_KEY = "giving.url";
export const GIVING_MODE_SETTING_KEY = "giving.mode";
export const GIVING_SUGGESTED_AMOUNTS_SETTING_KEY = "giving.suggested_amounts";
export const GIVING_AMOUNT_PARAM_SETTING_KEY = "giving.amount_param";
export const GIVING_RECURRING_SETTING_KEY = "giving.recurring_available";

/**
 * `link` sends the visitor to the provider. `embed` renders the provider's
 * own form in an iframe on the Donations page; see `givingEmbedSrc()` for why
 * that is narrower than it sounds.
 */
export type GivingMode = "link" | "embed";

export const GIVING_MODES: readonly {
  value: GivingMode;
  label: string;
  description: string;
}[] = [
  {
    value: "link",
    label: "Send them to the provider",
    description:
      "The Give button opens your giving page. This is what every provider supports, and the only option if yours refuses to be framed.",
  },
  {
    value: "embed",
    label: "Show the form on this page",
    description:
      "Your giving form renders inside the Donations page. Only works if your provider allows framing; the button is still there either way.",
  },
];

export function isGivingMode(value: unknown): value is GivingMode {
  return value === "link" || value === "embed";
}

export type GivingSettings = {
  enabled: boolean;
  providerLabel: string;
  url: string;
  mode: GivingMode;
  suggestedAmounts: number[];
  amountParam: string;
  recurringAvailable: boolean;
};

export const DEFAULT_GIVING_SETTINGS: GivingSettings = {
  enabled: false,
  providerLabel: "",
  url: "",
  mode: "link",
  suggestedAmounts: [],
  amountParam: "",
  recurringAvailable: false,
};

export const MAX_GIVING_URL_LENGTH = 500;
export const MAX_PROVIDER_LABEL_LENGTH = 60;
export const MAX_SUGGESTED_AMOUNTS = 6;
/**
 * Whole currency units, not cents: these are the buttons a visitor sees, and
 * a provider's amount parameter takes the same number the visitor typed.
 */
export const MAX_SUGGESTED_AMOUNT = 100000;

/**
 * The same rule set_giving_settings() enforces on the amount parameter. It is
 * the provider's own query-string name (`amount`, `amt`, `a`), so it has to be
 * safe to put on the left of an `=` and nothing more.
 */
export const AMOUNT_PARAM_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.[\]-]{0,39}$/;

/**
 * Why a URL is unusable, or null when it is fine. The same checks run in
 * set_giving_settings(), because a raw PostgREST write must not be able to
 * publish a `javascript:` URL onto the public site -- validating only in the
 * panel would leave the table's own policies as the whole guard.
 */
export function givingUrlError(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return "Enter the web address of your giving page.";
  if (trimmed.length > MAX_GIVING_URL_LENGTH) {
    return `The address must be ${MAX_GIVING_URL_LENGTH} characters or fewer.`;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "That is not a web address. Paste the whole thing, starting with https://.";
  }

  if (parsed.protocol !== "https:") {
    return "The address must start with https:// — a giving page asks for card details.";
  }
  // A host with no dot is a machine on somebody's own network, never a hosted
  // giving page, and `https://localhost` on a tenant's public site would be a
  // dead link for every visitor but the person who typed it.
  if (!parsed.hostname.includes(".") || parsed.hostname.endsWith(".")) {
    return "That address has no site name in it. Check it and paste it again.";
  }
  // `https://user:pass@host/` renders as the host in most link previews and
  // resolves somewhere else. Nothing legitimate needs it.
  if (parsed.username || parsed.password) {
    return "Remove the username and password from the address.";
  }
  return null;
}

export function isValidGivingUrl(url: string): boolean {
  return givingUrlError(url) === null;
}

/**
 * Whether anything renders publicly. Enabled alone is not enough: a tenant
 * that turned giving on and has not pasted a URL yet must get today's page
 * back rather than a button to nowhere.
 */
export function givingIsPublished(settings: GivingSettings): boolean {
  return settings.enabled && isValidGivingUrl(settings.url);
}

/**
 * The giving URL with one suggested amount on it, or the URL unchanged.
 *
 * A provider that takes no amount parameter gets a plain link, not a broken
 * one -- which is why the amounts are inert until `amountParam` is set, and
 * why the panel says so beside the field. An amount already on the configured
 * URL is replaced rather than appended, so two `amount=` pairs never reach a
 * provider that would have to guess between them.
 */
export function givingUrlWithAmount(
  url: string,
  amount: number,
  amountParam: string,
): string {
  if (!amountParam || !Number.isFinite(amount) || amount <= 0) return url;
  if (!isValidGivingUrl(url)) return url;
  const parsed = new URL(url.trim());
  parsed.searchParams.set(amountParam, String(amount));
  return parsed.toString();
}

/**
 * The origin an embedded provider form may be served from -- the URL's own
 * host and nothing else -- or null when the URL is unusable.
 *
 * This is the allowlist the ticket asks for, derived rather than configured:
 * the only origin that can ever appear in the iframe is the one already
 * published as the giving link, so turning `giving.mode` to `embed` cannot
 * turn the Donations page into an open frame on an arbitrary origin.
 */
export function givingEmbedOrigin(url: string): string | null {
  if (!isValidGivingUrl(url)) return null;
  return new URL(url.trim()).origin;
}

/**
 * The `src` for the embedded form: rebuilt from the URL's own origin, path
 * and query, with everything else (credentials, fragment) dropped. Null
 * whenever nothing should be framed -- giving off, mode `link`, or a URL that
 * does not pass `givingUrlError()`.
 *
 * The iframe itself is sandboxed at the call site. Together the two mean an
 * embed can only ever load the host the tenant already published a link to,
 * under a fixed set of permissions, whatever is stored in `giving.url`.
 */
export function givingEmbedSrc(settings: GivingSettings): string | null {
  if (!givingIsPublished(settings) || settings.mode !== "embed") return null;
  const parsed = new URL(settings.url.trim());
  return `${parsed.origin}${parsed.pathname}${parsed.search}`;
}

/**
 * A suggested amount as a button label: "$25", not "$25.00". Whole units only,
 * which is what `parseSuggestedAmounts()` admits -- a cents column on a button
 * a visitor is choosing between is noise.
 */
export function formatGivingAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Tolerant, like `parsePaymentMethods`: a malformed amount is dropped rather
 * than failing the whole read, so one bad row cannot take the Give card down.
 */
export function parseSuggestedAmounts(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const amounts: number[] = [];
  for (const entry of value) {
    const amount = typeof entry === "number" ? entry : Number(entry);
    if (!Number.isInteger(amount) || amount <= 0) continue;
    if (amount > MAX_SUGGESTED_AMOUNT) continue;
    if (amounts.includes(amount)) continue;
    amounts.push(amount);
    if (amounts.length >= MAX_SUGGESTED_AMOUNTS) break;
  }
  return amounts;
}

/** The shape get_giving_settings() returns, made safe to render. */
export function parseGivingSettings(value: unknown): GivingSettings {
  if (!value || typeof value !== "object") return DEFAULT_GIVING_SETTINGS;
  const record = value as Record<string, unknown>;
  const mode = record.mode;
  return {
    enabled: record.enabled === true,
    providerLabel: asString(record.provider_label).trim(),
    url: asString(record.url).trim(),
    mode: isGivingMode(mode) ? mode : "link",
    suggestedAmounts: parseSuggestedAmounts(record.suggested_amounts),
    amountParam: asString(record.amount_param).trim(),
    recurringAvailable: record.recurring_available === true,
  };
}

/**
 * The `public_giving_settings` view's rows, resolved. Same slot/value shape
 * as `public_gear_request_settings`, and the same reason for it: the view
 * hands `anon` a fixed list of keys rather than a prefix over `app_settings`.
 */
export function resolvePublicGivingSettings(
  rows: readonly { slot: string; value: unknown }[],
): GivingSettings {
  const bySlot = new Map(rows.map((row) => [row.slot, row.value]));
  return parseGivingSettings({
    enabled: bySlot.get("enabled"),
    provider_label: bySlot.get("provider_label"),
    url: bySlot.get("url"),
    mode: bySlot.get("mode"),
    suggested_amounts: bySlot.get("suggested_amounts"),
    amount_param: bySlot.get("amount_param"),
    recurring_available: bySlot.get("recurring_available"),
  });
}
