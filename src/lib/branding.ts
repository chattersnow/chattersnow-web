import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveImageUrl } from "@/lib/inventory";

/**
 * Per-tenant branding (#707 Phase 4), served from the design tokens.
 *
 * globals.css defines the brand as a handful of CSS custom properties, and
 * every component reads those rather than a literal colour -- which is what
 * makes theming a data problem. Each entry below names one of those
 * properties; a tenant sets the ones it wants under `brand.<key>` in
 * app_settings and `brandingCss()` turns them into a `<style>` block that
 * overrides the stylesheet's values. A token that is not set is not emitted,
 * so the stylesheet -- Chatter Snow's palette -- is the default for every
 * tenant, including Chatter Snow's own.
 *
 * Values are validated as six-digit hex before they reach the style block:
 * they come from a database row an admin typed into, and a `<style>` element
 * is the wrong place to trust free text.
 */
export type BrandColorToken = {
  key: string;
  cssVar: string;
  label: string;
  description: string;
  /** What globals.css ships, shown as the placeholder and the reset value. */
  defaultValue: string;
};

export const BRAND_COLOR_TOKENS: readonly BrandColorToken[] = [
  {
    key: "primary",
    cssVar: "--purple",
    label: "Accent",
    description: "Links, icons, focus rings and the eyebrow labels.",
    defaultValue: "#70419a",
  },
  {
    key: "primary_deep",
    cssVar: "--purple-deep",
    label: "Text and buttons",
    description: "Body text, headings and primary buttons.",
    defaultValue: "#32134f",
  },
  {
    key: "primary_soft",
    cssVar: "--purple-soft",
    label: "Tint",
    description: "Secondary buttons, muted surfaces and badges.",
    defaultValue: "#ede1fb",
  },
  {
    key: "background",
    cssVar: "--background",
    label: "Page background",
    description: "The page behind every card.",
    defaultValue: "#f7f0ff",
  },
] as const;

/** The accent bar and strip: the stops of the gradient, left to right. */
export const DEFAULT_ACCENT_STOPS = [
  "#e84855",
  "#f59e42",
  "#f4d35e",
  "#50b878",
  "#38a5db",
  "#8f55ba",
] as const;

export const MAX_ACCENT_STOPS = 8;

export type Branding = {
  /** Hex colour per token key; only the tokens the tenant has set. */
  colors: Record<string, string>;
  /** Null when the tenant has not set its own accent gradient. */
  accentStops: string[] | null;
  /** Resolved, renderable logo URL, or null for the stylesheet's mark. */
  logoUrl: string | null;
};

export const EMPTY_BRANDING: Branding = {
  colors: {},
  accentStops: null,
  logoUrl: null,
};

export function brandSettingKey(token: string): string {
  return `brand.${token}`;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

/** Lowercases a hex colour the admin typed, or returns null if it is not one. */
export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  return HEX_COLOR.test(trimmed) ? trimmed : null;
}

export type BrandingRow = { token: string; value: unknown };

/** Folds the `brand.*` rows into a Branding, dropping anything malformed. */
export function brandingFromRows(rows: readonly BrandingRow[]): Branding {
  const branding: Branding = { colors: {}, accentStops: null, logoUrl: null };
  for (const row of rows) {
    if (row.token === "accent_stops") {
      if (Array.isArray(row.value)) {
        const stops = row.value.filter(isHexColor).slice(0, MAX_ACCENT_STOPS);
        if (stops.length > 0) branding.accentStops = stops;
      }
      continue;
    }
    if (row.token === "logo_url") {
      if (typeof row.value === "string" && row.value.trim()) {
        branding.logoUrl = resolveImageUrl(row.value.trim());
      }
      continue;
    }
    const token = BRAND_COLOR_TOKENS.find((t) => t.key === row.token);
    if (token && isHexColor(row.value)) {
      branding.colors[token.key] = row.value;
    }
  }
  return branding;
}

/**
 * The accent gradient's stops, each with the percentage it sits at.
 *
 * Extracted from `gradient()` rather than recomputed beside it, because
 * /brand documents these positions to whoever is rebuilding the gradient in
 * Figma or Canva. Two copies of `index / (length - 1)` is the drift that page
 * exists to end -- a tenant with five stops would have been told six.
 */
export function accentStops(
  branding: Branding,
): { color: string; position: number }[] {
  const stops = branding.accentStops ?? DEFAULT_ACCENT_STOPS;
  const last = Math.max(stops.length - 1, 1);
  return stops.map((color, index) => ({
    color,
    position: Math.round((index / last) * 100),
  }));
}

function gradient(stops: readonly string[], alpha: number | null): string {
  const last = Math.max(stops.length - 1, 1);
  const parts = stops.map((stop, index) => {
    const position = Math.round((index / last) * 100);
    const color =
      alpha === null
        ? stop
        : `color-mix(in srgb, ${stop} ${alpha}%, transparent)`;
    return `${color} ${position}%`;
  });
  // A single stop still has to be a gradient, because `--rainbow` is used as
  // a background-image and a flat colour there would not paint.
  if (parts.length === 1) parts.push(parts[0]);
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

/**
 * The `<style>` body that applies a tenant's branding over globals.css, or
 * an empty string when there is nothing to override.
 *
 * The derived tokens follow the stylesheet's own derivations: `--line` and
 * `--muted-foreground` are the deep colour at 14% and 72%, `--foreground` is
 * the deep colour. Dark mode keeps the stylesheet's neutral surfaces and only
 * re-tints the two accents, lightened the way the stylesheet lightens its
 * own so text stays readable on the dark card.
 */
/**
 * The dark-mode form of a brand colour: its own hue, at a fixed lightness and
 * chroma chosen for a dark background.
 *
 * A brand colour is picked to read on white and is far too dark to read on
 * `oklch(0.145 0 0)`, so dark mode needs a lighter relative of it. What it must
 * *not* be is a white mix, which is what this used to do -- mixing toward white
 * in oklch drops chroma as it raises lightness, and no percentage reaches the
 * saturation a hand-picked dark accent has. Sweeping the old
 * `color-mix(... N%, white)` against globals.css's `#c8a8ea` never got closer
 * than 21 in RGB distance, at any N.
 *
 * Setting the lightness and capping the chroma, keeping only the hue, reaches it.
 * The constants below are globals.css's own dark values read back as oklch, so
 * a tenant that sets Chatter Snow's palette reproduces Chatter Snow's dark mode
 * exactly: `--purple` lands on `rgb(200, 168, 234)`, which is the stylesheet's
 * `#c8a8ea` to the byte. `--purple-deep` came out two units off, because the
 * stylesheet's two dark literals carried slightly different hues between them;
 * that one was nudged in globals.css to this derivation's output rather than
 * bent here, so there is one rule and not a rule plus an exception.
 *
 * Relative colour syntax is the mechanism (`oklch(from <colour> L C h)`). A
 * browser without it drops the declaration and falls back to the stylesheet's
 * own `.dark` literals, which is the behaviour every tenant has today anyway.
 */
const DARK_ACCENT = { lightness: 0.783, maxChroma: 0.098 };
const DARK_DEEP = { lightness: 0.884, maxChroma: 0.055 };

function darkVariant(
  color: string,
  { lightness, maxChroma }: { lightness: number; maxChroma: number },
): string {
  // `min(c, ...)` rather than a flat chroma (#795 Phase 3). Setting it outright
  // reproduced Chatter Snow's dark palette exactly, because a brand colour is
  // saturated by definition and the cap was always the smaller number. It is
  // wrong for the platform's own neutral default, which is barely chromatic at
  // all: forcing #475569 to 0.098 turns a slate grey into #90bbf7, a blue.
  // Clamping keeps both -- a saturated brand comes down to the cap, a neutral
  // one keeps its own chroma and stays neutral.
  return `oklch(from ${color} ${lightness} min(c, ${maxChroma}) h)`;
}

export type BrandColorPair = {
  token: BrandColorToken;
  /** The hex this tenant actually renders: its own, or the stylesheet's. */
  value: string;
  /**
   * The CSS the dark block paints this token with, or null for the two tokens
   * that have no dark form because dark mode keeps the stylesheet's neutral
   * surfaces (see `brandingCss`).
   */
  dark: string | null;
};

/**
 * Every brand colour with the value this tenant renders it at, for /brand.
 *
 * Note what this does that `brandingCss()` does not: it falls back to the
 * token's `defaultValue` for a colour the tenant has not set, because the
 * guide documents what a visitor *sees*, not what the tenant has overridden.
 * `brandingCss()` correctly emits nothing there and lets the stylesheet stand.
 * The two agree on what is painted, and the dark derivation is the same
 * function in both.
 */
export function brandColorPairs(branding: Branding): BrandColorPair[] {
  return BRAND_COLOR_TOKENS.map((token) => {
    const value = branding.colors[token.key] ?? token.defaultValue;
    const shape =
      token.key === "primary"
        ? DARK_ACCENT
        : token.key === "primary_deep"
          ? DARK_DEEP
          : null;
    return { token, value, dark: shape ? darkVariant(value, shape) : null };
  });
}

export function brandingCss(branding: Branding): string {
  const light: string[] = [];
  const dark: string[] = [];

  for (const token of BRAND_COLOR_TOKENS) {
    const value = branding.colors[token.key];
    if (value) light.push(`${token.cssVar}: ${value};`);
  }
  const deep = branding.colors.primary_deep;
  if (deep) {
    light.push(`--foreground: ${deep};`);
    light.push(`--line: color-mix(in srgb, ${deep} 14%, transparent);`);
    light.push(
      `--muted-foreground: color-mix(in srgb, ${deep} 72%, transparent);`,
    );
    dark.push(`--purple-deep: ${darkVariant(deep, DARK_DEEP)};`);
  }
  const primary = branding.colors.primary;
  if (primary) {
    dark.push(`--purple: ${darkVariant(primary, DARK_ACCENT)};`);
  }
  if (branding.accentStops) {
    light.push(`--rainbow: ${gradient(branding.accentStops, null)};`);
    light.push(`--rainbow-soft: ${gradient(branding.accentStops, 12)};`);
    // `--rainbow` is repeated rather than inherited: it is the one brand token
    // globals.css does *not* restate under `.dark`, so with the light block
    // scoped away from dark pages there would be nothing left to override the
    // stylesheet's own gradient, and a tenant's accent would revert to Chatter
    // Snow's colours in dark mode.
    dark.push(`--rainbow: ${gradient(branding.accentStops, null)};`);
    dark.push(`--rainbow-soft: ${gradient(branding.accentStops, 10)};`);
  }

  const blocks: string[] = [];
  // `:root:not(.dark)`, never a bare `:root` (#819). Both are specificity
  // (0,1,0), and this block is injected into the document after the
  // stylesheet, so a bare `:root` outranks globals.css's `.dark` on the tie --
  // for every token the dark half below does not restate. `--background` is
  // one of those, so a tenant that set a page background got it on dark pages
  // too: measured `rgb(247, 240, 255)` where the stylesheet says
  // `oklch(0.145 0 0)`. Dark mode went light.
  //
  // Scoping it also states the right rule rather than patching the symptom.
  // A tenant's palette is a *light* palette -- `background`, `foreground`,
  // `line` and `muted-foreground` are all neutral in dark mode by design --
  // so the light block has no business applying to a dark page at all. What a
  // dark page needs from the brand is the accent, which is what the dark block
  // carries.
  if (light.length > 0) blocks.push(`:root:not(.dark) { ${light.join(" ")} }`);
  if (dark.length > 0) blocks.push(`.dark { ${dark.join(" ")} }`);
  return blocks.join("\n");
}

/**
 * The branding for the site the request host resolves to -- what the public
 * layout applies. Read through `public_branding`, so an admin of one tenant
 * looking at another tenant's site sees that site's colours, not their own.
 */
export async function getPublicBranding(
  supabase: SupabaseClient,
): Promise<Branding> {
  const { data, error } = await supabase
    .from("public_branding")
    .select("token, value");
  if (error) return EMPTY_BRANDING;
  return brandingFromRows((data ?? []) as BrandingRow[]);
}

export type PublicTenant = {
  id: string;
  name: string;
  slug: string;
  /**
   * The host this tenant claims. Null until an operator sets one, which is the
   * normal state on the local stack and on preview, where the tenant is
   * resolved through TENANT_HOST_OVERRIDE rather than by domain.
   */
  custom_domain: string | null;
};

/**
 * Why this is three outcomes and not a nullable tenant (#795 Phase 4).
 *
 * "No tenant resolved" and "the read failed" are the same `null` to a caller
 * that only asks whether a tenant came back, and they call for opposite
 * responses. An unresolved host belongs to nobody and must 404. A failed read
 * is a database blip on a host that is perfectly well configured, and 404ing
 * it would take every tenant's public site down for the duration.
 *
 * So they are told apart here, at the only place that can tell them apart,
 * rather than reconstructed later from a null.
 */
export type PublicTenantResult =
  /** A tenant owns this host. */
  | { status: "resolved"; tenant: PublicTenant }
  /** The query succeeded and matched nothing: no `custom_domain` matched the
   *  request host, and the sole-active-tenant fallback is off because more
   *  than one tenant is active. This is where a domain pointed at the
   *  deployment before its tenant row exists lands. */
  | { status: "unresolved" }
  /** The read itself failed. Says nothing about whether a tenant exists. */
  | { status: "unavailable" };

/** The tenant the public site is being served for, resolved from the host. */
export async function getPublicTenant(
  supabase: SupabaseClient,
): Promise<PublicTenantResult> {
  const { data, error } = await supabase
    .from("public_tenant")
    .select("id, name, slug, custom_domain")
    .maybeSingle();
  if (error) {
    // Loudly: this is the branch that keeps a blip from 404ing the site, so a
    // silent one would look exactly like a correctly-refused unknown host.
    console.error(
      "[branding] could not read public_tenant; serving the request rather than 404ing it",
      error,
    );
    return { status: "unavailable" };
  }
  if (!data) return { status: "unresolved" };
  return { status: "resolved", tenant: data as PublicTenant };
}
