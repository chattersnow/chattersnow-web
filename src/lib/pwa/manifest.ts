import type { Metadata, MetadataRoute } from "next";
import { BRAND_COLOR_TOKENS, type Branding } from "@/lib/branding";
import type { PublicTenantResult } from "@/lib/branding";

/**
 * The installed apps' identity, per tenant and per surface (#1083, #1171).
 *
 * A PWA's install is keyed to its origin plus `scope`, and every live tenant
 * already has a host of its own (`tenants.custom_domain`), so the manifest
 * served at a host is free to answer for that host's tenant alone and two
 * tenants can never collide. What goes on the home screen is therefore the
 * organization's name, colour and icon -- never the platform's, and never the
 * first tenant's.
 *
 * There are two apps, not one. A real tenant serves its website and its portal
 * from two origins (`www.<domain>` and `portal.<domain>`), which is two
 * installs whatever a manifest says, and since #1160 a supporter signed in at
 * `/my` has a reason to install the public side. So each surface names itself:
 * the supporter app is the organization, the staff app is `<Name> Ops`.
 *
 * Kept pure and separate from the two routes that serve it so the rule can be
 * tested without a request: "two tenants on two hosts install with their own
 * name, colour and icon, and the two surfaces install as two apps" is an
 * assertion about this function.
 */

/** Which of the two apps a manifest is for. */
export type AppSurface = "portal" | "public";

/**
 * The name an install gets on a host no tenant claims.
 *
 * Root `metadata` deliberately names no organization (#795 Phase 4) so that a
 * host pointed at the deployment before its tenant row exists cannot publish
 * whichever organization the defaults happen to name. The manifests follow the
 * same rule, and one step further: they name no *product* either, because the
 * platform is white-label and nothing on anybody's home screen says Coven.
 *
 * One per surface, because the two neutral installs still have to be told
 * apart on a home screen that holds both.
 */
export const NEUTRAL_APP_NAME = "Operations portal";
export const NEUTRAL_PUBLIC_APP_NAME = "Community site";

/**
 * What a manifest is served as.
 *
 * `application/manifest+json` is the registered type, and the two routes are
 * explicit route handlers rather than metadata conventions since #1171, so
 * they set it themselves.
 */
export const MANIFEST_CONTENT_TYPE = "application/manifest+json";

/** The URL each surface's manifest is served at. */
export const PORTAL_MANIFEST_PATH = "/manifest.webmanifest";
export const PUBLIC_MANIFEST_PATH = "/site.webmanifest";

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

/** What a browser tab renders. One of `APP_ICON_SIZES`, so it needs no size of its own. */
export const FAVICON_SIZE = 192;

/**
 * The `icons` every surface layout declares (#1398).
 *
 * It has to name `icon` and not only `apple`. Next applies the `app/icon.png`
 * file convention only when *no* segment of the route declared
 * `metadata.icons` at all -- `accumulateMetadata` merges the static icons
 * under `if (!resolvedMetadata.icons)` -- so declaring `apple` on its own, as
 * the two layouts did from #1083 and #1171, dropped `<link rel="icon">` from
 * every page of the public site and the portal. Browsers then asked for
 * `/favicon.ico`, which this app does not serve, and showed the default blank
 * page icon on `www.`, `portal.` and the demo alike.
 *
 * Pointing it at the generated route rather than the committed `icon.png`
 * keeps the mark per tenant, which is the same reason the manifest and the
 * apple-touch icon point there: one fixed file would put the platform's icon
 * in every tenant's tab. `app/icon.png` still answers for routes outside
 * both layouts -- the unresolved-host 404 and `/links` -- where naming no
 * organization is the point.
 */
export const APP_ICONS_METADATA = {
  icon: [
    {
      url: `${APP_ICON_PATH}/${FAVICON_SIZE}`,
      type: "image/png",
      sizes: `${FAVICON_SIZE}x${FAVICON_SIZE}`,
    },
  ],
  apple: `${APP_ICON_PATH}/${APPLE_TOUCH_ICON_SIZE}`,
} satisfies Metadata["icons"];

/** A home-screen label is truncated by the launcher at roughly this length. */
const SHORT_NAME_MAX = 12;

/**
 * What the staff app appends to the organization's name.
 *
 * A role word rather than a product name, so the white-label rule (#795
 * Phase 4) still holds: the home screen says what the app is *for*, not what
 * it was built with.
 */
const OPS_SUFFIX = " Ops";

/** The URL each surface is served from when it does not own the origin root. */
const SURFACE_BASE: Record<AppSurface, string> = {
  portal: "/portal",
  public: "/my",
};

function brandDefault(key: string): string {
  return BRAND_COLOR_TOKENS.find((token) => token.key === key)!.defaultValue;
}

export type ManifestInput = {
  /** Which app this manifest installs. */
  surface: AppSurface;
  /** Which of the three host-resolution outcomes this request had. */
  status: PublicTenantResult["status"];
  /** The organization's name, or null when there is none to name. */
  name: string | null;
  branding: Branding;
  /**
   * True when this surface has the origin root to itself.
   *
   * For the portal that is a `portal.` host, where the proxy strips the
   * `/portal` prefix off every visible URL. For the public site it is a host
   * whose `/portal/*` is redirected away to a portal host of its own, which
   * leaves `/` free for the whole website.
   *
   * False on a host that serves both surfaces from one origin -- the demo
   * tenant, a preview, a local run. There the portal is a path under
   * `/portal` and the public app narrows to `/my`, so the two `scope`s cannot
   * overlap and an install cannot swallow the other app.
   */
  atRoot: boolean;
};

function clampName(name: string, max: number): string {
  const trimmed = name.trim();
  if (trimmed.length <= max) return trimmed;
  const firstWord = trimmed.split(/\s+/)[0];
  return firstWord.length <= max ? firstWord : trimmed.slice(0, max).trimEnd();
}

/**
 * The supporter app's short name: the organization's, trimmed to what a
 * launcher will actually show rather than truncated mid-word by the launcher
 * itself.
 */
export function shortAppName(name: string): string {
  return clampName(name, SHORT_NAME_MAX);
}

/**
 * The staff app's short name: the same trim, against a smaller budget.
 *
 * A launcher shows `short_name` and cuts it around `SHORT_NAME_MAX`, and this
 * one has to fit " Ops" as well -- so the organization's part is clamped to
 * what is left rather than to the full budget. "Chatter Snow" becomes
 * "Chatter Ops" and not a label the launcher cuts to "Chatter Snow…".
 */
export function opsShortName(name: string): string {
  return `${clampName(name, SHORT_NAME_MAX - OPS_SUFFIX.length)}${OPS_SUFFIX}`;
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
 * Builds one surface's web app manifest for one request.
 *
 * `start_url` and `scope` are host-aware because the surfaces' own URLs are:
 * on a `portal.` host the proxy 307s `/portal/home` back to `/home`, so an
 * install pointed at the prefixed path would redirect on every launch, and a
 * `scope` of `/portal` would not contain a single page the app can reach --
 * which drops the window out of standalone at the first navigation. The
 * public app has the mirror image of that problem on a host that serves both:
 * a `scope` of `/` there would contain the portal too, and the two installs
 * would fight over the same pages.
 */
export function appManifest(input: ManifestInput): MetadataRoute.Manifest {
  const base = input.atRoot ? "" : SURFACE_BASE[input.surface];
  const scope = base || "/";
  const isPortal = input.surface === "portal";
  // Only `resolved` may name an organization. `unavailable` is a read that
  // failed and says nothing about who owns the host, so it names nobody too --
  // the public site keeps rendering through a blip, but an *install* is
  // permanent, and one made during a blip would be permanently anonymous
  // rather than wrong, which is the safe direction.
  const name = input.status === "resolved" ? input.name : null;
  const neutral = isPortal ? NEUTRAL_APP_NAME : NEUTRAL_PUBLIC_APP_NAME;
  const { colors } = input.branding;

  return {
    // Stable across a rename so a tenant that changes its name updates its
    // existing install rather than orphaning it and installing a second app.
    // It is also what makes the `<Name> Ops` rename safe for the portals
    // already on people's home screens: `id` is `scope`, and neither moved.
    id: scope,
    name: name ? (isPortal ? `${name}${OPS_SUFFIX}` : name) : neutral,
    short_name: name
      ? isPortal
        ? opsShortName(name)
        : shortAppName(name)
      : neutral,
    // The portal launches at its dashboard; the public app launches at
    // whatever its scope is -- the whole website where it owns the origin,
    // the account area where it shares one.
    start_url: isPortal ? `${base}/home` : scope,
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
