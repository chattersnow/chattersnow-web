import { describe, expect, test } from "bun:test";
import { EMPTY_BRANDING, type Branding } from "@/lib/branding";
import {
  APP_ICON_PATH,
  NEUTRAL_APP_NAME,
  appIconInitials,
  portalManifest,
  shortAppName,
  type ManifestInput,
} from "@/lib/pwa/manifest";

function input(overrides: Partial<ManifestInput> = {}): ManifestInput {
  return {
    status: "resolved",
    name: "Chatter Snow",
    branding: EMPTY_BRANDING,
    portalAtRoot: false,
    ...overrides,
  };
}

function branded(colors: Record<string, string>): Branding {
  return { ...EMPTY_BRANDING, colors };
}

describe("portalManifest", () => {
  test("installs under the tenant's own name, colour and icon", () => {
    const manifest = portalManifest(
      input({
        name: "Chatter Snow",
        branding: branded({ primary_deep: "#101010", background: "#fefefe" }),
      }),
    );

    expect(manifest.name).toBe("Chatter Snow");
    expect(manifest.theme_color).toBe("#101010");
    expect(manifest.background_color).toBe("#fefefe");
    expect(manifest.icons?.map((icon) => icon.src)).toEqual([
      `${APP_ICON_PATH}/192`,
      `${APP_ICON_PATH}/192`,
      `${APP_ICON_PATH}/512`,
      `${APP_ICON_PATH}/512`,
    ]);
  });

  test("two tenants on two hosts install as two different apps", () => {
    const one = portalManifest(
      input({
        name: "Chatter Snow",
        branding: branded({ primary_deep: "#111111" }),
      }),
    );
    const two = portalManifest(
      input({
        name: "Harbour Trust",
        branding: branded({ primary_deep: "#222222" }),
      }),
    );

    expect(one.name).not.toBe(two.name);
    expect(one.theme_color).not.toBe(two.theme_color);
    // The icon URL is the same path on purpose: it is relative, so each
    // install resolves it against its own origin and gets its own tenant's.
    expect(one.icons?.[0]?.src).toBe(two.icons?.[0]?.src ?? "");
  });

  test("names no organization -- and no product -- on an unresolved host", () => {
    const manifest = portalManifest(
      input({ status: "unresolved", name: "Chatter Snow" }),
    );

    expect(manifest.name).toBe(NEUTRAL_APP_NAME);
    expect(manifest.short_name).toBe(NEUTRAL_APP_NAME);
    expect(JSON.stringify(manifest)).not.toContain("Chatter Snow");
    expect(JSON.stringify(manifest)).not.toContain("Coven");
  });

  test("names nobody when the tenant read failed", () => {
    expect(
      portalManifest(input({ status: "unavailable", name: null })).name,
    ).toBe(NEUTRAL_APP_NAME);
  });

  test("falls back to the stylesheet's colours for an unbranded tenant", () => {
    const manifest = portalManifest(input({ branding: EMPTY_BRANDING }));

    expect(manifest.theme_color).toBe("#32134f");
    expect(manifest.background_color).toBe("#f7f0ff");
    // Still a real icon: the route draws the initials.
    expect(manifest.icons?.length).toBe(4);
  });

  test("launches the portal, not the marketing site", () => {
    const onPath = portalManifest(input({ portalAtRoot: false }));
    expect(onPath.start_url).toBe("/portal/home");
    expect(onPath.scope).toBe("/portal");
    expect(onPath.display).toBe("standalone");
  });

  test("drops the prefix on a host that serves the portal at its root", () => {
    const atRoot = portalManifest(input({ portalAtRoot: true }));
    // The proxy 307s /portal/home back to /home on a `portal.` host, so the
    // prefixed form would redirect on every launch, and a `/portal` scope
    // would contain no page the app can reach.
    expect(atRoot.start_url).toBe("/home");
    expect(atRoot.scope).toBe("/");
    expect(atRoot.id).toBe("/");
  });

  test("lists every icon as both any and maskable", () => {
    const purposes = portalManifest(input()).icons?.map((icon) => icon.purpose);
    expect(purposes).toEqual(["any", "maskable", "any", "maskable"]);
  });
});

describe("shortAppName", () => {
  test("keeps a name a launcher will show whole", () => {
    expect(shortAppName("Chatter Snow")).toBe("Chatter Snow");
  });

  test("prefers the first word over a mid-word cut", () => {
    expect(shortAppName("Riverside Community Tool Library")).toBe("Riverside");
  });

  test("cuts a single long word rather than showing nothing", () => {
    expect(shortAppName("Gemeinnuetzigkeitsverein")).toBe("Gemeinnuetzi");
  });
});

describe("appIconInitials", () => {
  test("one letter per word, at most two", () => {
    expect(appIconInitials("Chatter Snow")).toBe("CS");
    expect(appIconInitials("Riverside Community Tool Library")).toBe("RC");
    expect(appIconInitials("Coven")).toBe("C");
  });

  test("ignores punctuation rather than drawing it", () => {
    expect(appIconInitials("St. Jude's")).toBe("SJ");
    expect(appIconInitials("  spaced   out  ")).toBe("SO");
  });

  test("falls back to a neutral mark rather than an empty square", () => {
    expect(appIconInitials(null)).toBe("•");
    expect(appIconInitials("!!!")).toBe("•");
  });
});
