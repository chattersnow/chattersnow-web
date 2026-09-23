import { ImageResponse } from "next/og";
import {
  BRAND_COLOR_TOKENS,
  getPublicBranding,
  getPublicTenant,
} from "@/lib/branding";
import { APP_ICON_SIZES, appIconInitials } from "@/lib/pwa/manifest";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadRemoteIcon, MASKABLE_SAFE_FRACTION } from "./icon-source";

/**
 * The installed portal's home-screen icon, per tenant (#1083).
 *
 * Under `/api/` deliberately: the proxy passes that prefix through untouched
 * on a `portal.` host, where everything else is rewritten into `/portal/*`.
 *
 * One route for both icon sources, which is the whole point of generating it
 * rather than linking `brand.logo_url` straight into the manifest. Whatever a
 * tenant has -- an uploaded square icon, or nothing at all -- comes back as a
 * correctly-sized PNG whose content sits inside the maskable safe zone, so
 * Android cannot crop a wordmark off and a tenant that has uploaded nothing
 * still installs with a real icon rather than a default naming somebody else.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ size: string }> },
) {
  const { size: rawSize } = await context.params;
  const size = Number(rawSize);
  if (!APP_ICON_SIZES.includes(size)) {
    return new Response("Not found", { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  const [tenantResult, branding] = await Promise.all([
    getPublicTenant(supabase),
    getPublicBranding(supabase),
  ]);
  // Same rule as the manifest and as root `metadata` (#795 Phase 4): a host no
  // tenant claims gets no organization's initials.
  const name =
    tenantResult.status === "resolved" ? tenantResult.tenant.name : null;

  const background =
    branding.colors.primary_deep ??
    BRAND_COLOR_TOKENS.find((token) => token.key === "primary_deep")!
      .defaultValue;
  const inner = Math.round(size * MASKABLE_SAFE_FRACTION);
  const uploaded = await loadRemoteIcon(branding.appIconUrl, request.url);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Painted edge to edge rather than left transparent: a maskable icon
        // is masked to the launcher's shape, and a transparent background
        // gives it nothing to cut, so the letters end up floating on
        // whatever the launcher paints behind them.
        backgroundColor: background,
      }}
    >
      {uploaded ? (
        // Satori renders a subset of HTML into a raster; `next/image` is a
        // React component that emits a browser-only srcset and never runs
        // here, so the plain tag is the only option.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={uploaded}
          width={inner}
          height={inner}
          style={{ objectFit: "contain" }}
          alt=""
        />
      ) : (
        <div
          style={{
            display: "flex",
            fontSize: Math.round(inner * 0.5),
            fontWeight: 700,
            letterSpacing: -Math.round(inner * 0.02),
            color: "#ffffff",
          }}
        >
          {appIconInitials(name)}
        </div>
      )}
    </div>,
    {
      width: size,
      height: size,
      headers: {
        // An installed icon is fetched once and then lives on a home screen,
        // so a long cache costs nothing a reinstall does not fix -- and the
        // URL is per host, so one tenant's cached icon can never be served to
        // another.
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}
