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
    dark.push(`--purple-deep: color-mix(in oklch, ${deep} 30%, white);`);
  }
  const primary = branding.colors.primary;
  if (primary) {
    dark.push(`--purple: color-mix(in oklch, ${primary} 55%, white);`);
  }
  if (branding.accentStops) {
    light.push(`--rainbow: ${gradient(branding.accentStops, null)};`);
    light.push(`--rainbow-soft: ${gradient(branding.accentStops, 12)};`);
    dark.push(`--rainbow-soft: ${gradient(branding.accentStops, 10)};`);
  }

  const blocks: string[] = [];
  if (light.length > 0) blocks.push(`:root { ${light.join(" ")} }`);
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

export type PublicTenant = { id: string; name: string; slug: string };

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
    .select("id, name, slug")
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
