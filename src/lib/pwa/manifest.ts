import type { MetadataRoute } from "next";
import { BRAND_COLOR_TOKENS, type Branding } from "@/lib/branding";
import type { PublicTenantResult } from "@/lib/branding";

/**
 * The installed portal's identity, per tenant (#1083).
 *
 * A PWA's install is keyed to its origin plus `scope`, and every live tenant
 * already has a host of its own (`tenants.custom_domain`), so the manifest
 * served at a host is free to answer for that host's tenant alone and two
 * installs can never collide. What goes on the home screen is therefore the
 * organization's name, colour and icon -- never the platform's, and never the
 * first tenant's.
 *
 * Kept pure and separate from `src/app/manifest.ts` so the rule can be tested
 * without a request: "two tenants on two hosts install with their own name,
 * colour and icon" is an assertion about this function.
 */

/**
 * The name an install gets on a host no tenant claims.
 *
 * Root `metadata` deliberately names no organization (#795 Phase 4) so that a
 * host pointed at the deployment before its tenant row exists cannot publish
 * whichever organization the defaults happen to name. The manifest follows the
 * same rule, and one step further: it names no *product* either, because the
 * platform is white-label and nothing on anybody's home screen says Coven.
 */
export const NEUTRAL_APP_NAME = "Operations portal";

/** Where the generated/composed app icon is served from. */
export const APP_ICON_PATH = "/api/app-icon";

/** The manifest's icon sizes. `APPLE_TOUCH_ICON_SIZE` is served too. */
export const MANIFEST_ICON_SIZES = [192, 512] as const;

/** What iOS asks for by `<link rel="apple-touch-icon">`. */
export const APPLE_TOUCH_ICON_SIZE = 180;

/** Every size `/api/app-icon/<size>` will render; anything else 404s. */
export const APP_ICON_SIZES: readonly number[] = [
  APPLE_TOUCH_ICON_SIZE,
  ...MANIFEST_ICON_SIZES,
];

/** A home-screen label is truncated by the launcher at roughly this length. */
const SHORT_NAME_MAX = 12;

function brandDefault(key: string): string {
  return BRAND_COLOR_TOKENS.find((token) => token.key === key)!.defaultValue;
}

export type ManifestInput = {
  /** Which of the three host-resolution outcomes this request had. */
  status: PublicTenantResult["status"];
  /** The organization's name, or null when there is none to name. */
  name: string | null;
  branding: Branding;
  /**
   * True when the portal is served from the origin root -- a `portal.` host,
   * where the proxy strips the `/portal` prefix off every visible URL. False
   * on a host that serves the portal as a path (the demo tenant, a preview,
   * a local run).
   */
  portalAtRoot: boolean;
};

/**
 * The portal's short name: the organization's, trimmed to what a launcher
 * will actually show rather than truncated mid-word by the launcher itself.
 */
export function shortAppName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= SHORT_NAME_MAX) return trimmed;
  const firstWord = trimmed.split(/\s+/)[0];
  return firstWord.length <= SHORT_NAME_MAX
    ? firstWord
    : trimmed.slice(0, SHORT_NAME_MAX).trimEnd();
}

/**
 * The initials the generated icon draws: one letter per word, at most two.
 *
 * Non-letters are dropped before the split, so "St. Jude's" is SJ rather than
 * S. and a name that is entirely punctuation or a script this has no letters
 * for falls back to the neutral mark rather than rendering an empty square.
 */
export function appIconInitials(name: string | null): string {
  const words = (name ?? "")
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const initials = words
    .slice(0, 2)
    .map((word) => word[0])
    .join("");
  return initials.toLocaleUpperCase() || "•";
}

/**
 * Builds the web app manifest for one request.
 *
 * `start_url` and `scope` are host-aware because the portal's own URLs are:
 * on a `portal.` host the proxy 307s `/portal/home` back to `/home`, so an
 * install pointed at the prefixed path would redirect on every launch, and a
 * `scope` of `/portal` would not contain a single page the app can reach --
 * which drops the window out of standalone at the first navigation.
 */
export function portalManifest(input: ManifestInput): MetadataRoute.Manifest {
  const base = input.portalAtRoot ? "" : "/portal";
  const scope = base || "/";
  // Only `resolved` may name an organization. `unavailable` is a read that
  // failed and says nothing about who owns the host, so it names nobody too --
  // the public site keeps rendering through a blip, but an *install* is
  // permanent, and one made during a blip would be permanently anonymous
  // rather than wrong, which is the safe direction.
  const name = input.status === "resolved" ? input.name : null;
  const { colors } = input.branding;

  return {
    // Stable across a rename so a tenant that changes its name updates its
    // existing install rather than orphaning it and installing a second app.
    id: scope,
    name: name ?? NEUTRAL_APP_NAME,
    short_name: name ? shortAppName(name) : NEUTRAL_APP_NAME,
    start_url: `${base}/home`,
    scope,
    display: "standalone",
    theme_color: colors.primary_deep ?? brandDefault("primary_deep"),
    background_color: colors.background ?? brandDefault("background"),
    orientation: "portrait",
    icons: MANIFEST_ICON_SIZES.flatMap((size) => {
      const icon = {
        src: `${APP_ICON_PATH}/${size}`,
        sizes: `${size}x${size}`,
        type: "image/png",
      };
      // The same raster in both roles. `/api/app-icon` composes whatever the
      // tenant has -- an upload or its initials -- inside the maskable safe
      // zone, so one image is honestly both, and listing it twice is what the
      // manifest spec's single-valued `purpose` requires.
      return [
        { ...icon, purpose: "any" as const },
        { ...icon, purpose: "maskable" as const },
      ];
    }),
  };
}
