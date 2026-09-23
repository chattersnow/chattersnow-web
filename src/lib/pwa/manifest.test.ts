import { describe, expect, test } from "bun:test";
import { EMPTY_BRANDING, type Branding } from "@/lib/branding";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP_ICONS_METADATA,
  APP_ICON_PATH,
  APP_ICON_SIZES,
  FAVICON_SIZE,
  NEUTRAL_APP_NAME,
  NEUTRAL_PUBLIC_APP_NAME,
  appIconInitials,
  appManifest,
  opsShortName,
  shortAppName,
  type ManifestInput,
} from "@/lib/pwa/manifest";

function input(overrides: Partial<ManifestInput> = {}): ManifestInput {
  return {
    surface: "portal",
    status: "resolved",
    name: "Chatter Snow",
    branding: EMPTY_BRANDING,
    atRoot: false,
    ...overrides,
  };
}

function publicInput(overrides: Partial<ManifestInput> = {}): ManifestInput {
  return input({ surface: "public", ...overrides });
}

function branded(colors: Record<string, string>): Branding {
  return { ...EMPTY_BRANDING, colors };
}

describe("appManifest", () => {
  test("installs under the tenant's own name, colour and icon", () => {
    const manifest = appManifest(
      publicInput({
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
    const one = appManifest(
      input({
        name: "Chatter Snow",
        branding: branded({ primary_deep: "#111111" }),
      }),
    );
    const two = appManifest(
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
    for (const surface of ["portal", "public"] as const) {
      const manifest = appManifest(
        input({ surface, status: "unresolved", name: "Chatter Snow" }),
      );

      expect(manifest.name).toBe(
        surface === "portal" ? NEUTRAL_APP_NAME : NEUTRAL_PUBLIC_APP_NAME,
      );
      expect(manifest.short_name).toBe(manifest.name);
      expect(JSON.stringify(manifest)).not.toContain("Chatter Snow");
      expect(JSON.stringify(manifest)).not.toContain("Coven");
    }
  });

  test("names nobody when the tenant read failed", () => {
    expect(appManifest(input({ status: "unavailable", name: null })).name).toBe(
      NEUTRAL_APP_NAME,
    );
    expect(
      appManifest(publicInput({ status: "unavailable", name: null })).name,
    ).toBe(NEUTRAL_PUBLIC_APP_NAME);
  });

  test("the two neutral names are told apart on a home screen holding both", () => {
    expect(NEUTRAL_APP_NAME).not.toBe(NEUTRAL_PUBLIC_APP_NAME);
  });

  test("falls back to the stylesheet's colours for an unbranded tenant", () => {
    const manifest = appManifest(input({ branding: EMPTY_BRANDING }));

    expect(manifest.theme_color).toBe("#32134f");
    expect(manifest.background_color).toBe("#f7f0ff");
    // Still a real icon: the route draws the initials.
    expect(manifest.icons?.length).toBe(4);
  });

  test("launches the portal, not the marketing site", () => {
    const onPath = appManifest(input({ atRoot: false }));
    expect(onPath.start_url).toBe("/portal/home");
    expect(onPath.scope).toBe("/portal");
    expect(onPath.display).toBe("standalone");
  });

  test("drops the prefix on a host that serves the portal at its root", () => {
    const atRoot = appManifest(input({ atRoot: true }));
    // The proxy 307s /portal/home back to /home on a `portal.` host, so the
    // prefixed form would redirect on every launch, and a `/portal` scope
    // would contain no page the app can reach.
    expect(atRoot.start_url).toBe("/home");
    expect(atRoot.scope).toBe("/");
    expect(atRoot.id).toBe("/");
  });

  test("the public app is the whole website where it owns the origin", () => {
    const manifest = appManifest(publicInput({ atRoot: true }));
    // Tapping from /my through to an event or the donate page has to stay
    // inside the standalone window.
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.id).toBe("/");
  });

  test("the public app narrows to /my where one origin serves both", () => {
    const manifest = appManifest(publicInput({ atRoot: false }));
    expect(manifest.start_url).toBe("/my");
    expect(manifest.scope).toBe("/my");
  });

  test("the two scopes never overlap on a shared origin", () => {
    const portal = appManifest(input({ atRoot: false }));
    const supporter = appManifest(publicInput({ atRoot: false }));

    expect(portal.scope).toBe("/portal");
    expect(supporter.scope).toBe("/my");
    expect(String(portal.scope).startsWith(String(supporter.scope))).toBe(
      false,
    );
    expect(String(supporter.scope).startsWith(String(portal.scope))).toBe(
      false,
    );
    // `id` is `scope`, so two installs on one origin are two apps.
    expect(portal.id).not.toBe(supporter.id);
  });

  test("the staff app says what it is for, without naming the platform", () => {
    const portal = appManifest(input({ name: "Chatter Snow" }));
    const supporter = appManifest(publicInput({ name: "Chatter Snow" }));

    expect(portal.name).toBe("Chatter Snow Ops");
    expect(portal.short_name).toBe("Chatter Ops");
    // The supporter app is the one most people install, so it carries the
    // organization's plain name.
    expect(supporter.name).toBe("Chatter Snow");
    expect(supporter.short_name).toBe("Chatter Snow");
    expect(portal.name).not.toBe(supporter.name);
    expect(JSON.stringify([portal, supporter])).not.toContain("Coven");
  });

  test("a rename keeps the existing install rather than duplicating it", () => {
    // `id` is `scope`, which no rename touches -- which is what made the
    // `<Name> Ops` rename safe for the portals already on home screens.
    const before = appManifest(input({ name: "Chatter Snow" }));
    const after = appManifest(input({ name: "Chatter Snow Collective" }));
    expect(after.id).toBe(before.id ?? "");
    expect(after.name).not.toBe(before.name);
  });

  test("lists every icon as both any and maskable", () => {
    const purposes = appManifest(input()).icons?.map((icon) => icon.purpose);
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

describe("opsShortName", () => {
  test("keeps the suffix inside what a launcher shows", () => {
    // The budget is the same twelve characters, less " Ops".
    expect(opsShortName("Chatter Snow")).toBe("Chatter Ops");
    expect(opsShortName("Chatter Snow").length).toBeLessThanOrEqual(12);
  });

  test("clamps a long name against the smaller budget", () => {
    expect(opsShortName("Riverside Community Tool Library")).toBe(
      "Riversid Ops",
    );
    expect(
      opsShortName("Riverside Community Tool Library").length,
    ).toBeLessThanOrEqual(12);
  });

  test("still ends in the role word for a single long word", () => {
    expect(opsShortName("Gemeinnuetzigkeitsverein")).toBe("Gemeinnu Ops");
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

/** Every `layout.tsx` and `page.tsx` under `src/app`, recursively. */
function appSegmentSources(dir = "src/app"): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return appSegmentSources(path);
    return /^(layout|page)\.tsx$/.test(entry.name) ? [path] : [];
  });
}

describe("APP_ICONS_METADATA", () => {
  // The regression #1398 was. Next merges the `app/icon.png` file convention
  // into a route's metadata only when nothing in that route declared
  // `metadata.icons`, so an object here that carries `apple` alone silently
  // removes the favicon from every page under the layout that declares it.
  test("declares a tab icon, not only the home-screen one", () => {
    expect(APP_ICONS_METADATA.icon.length).toBeGreaterThan(0);
    expect(APP_ICONS_METADATA.icon[0]?.url).toBe(
      `${APP_ICON_PATH}/${FAVICON_SIZE}`,
    );
  });

  // A size outside the allowlist 404s, which is the same blank tab by another
  // route.
  test("asks the icon route for a size it will render", () => {
    expect(APP_ICON_SIZES).toContain(FAVICON_SIZE);
  });

  // The constant only helps if it is the single place `icons` is written: a
  // layout that spells its own object out is free to omit `icon` again.
  test("is the only `icons` metadata any app segment declares", () => {
    const offenders = appSegmentSources().filter((path) => {
      const source = readFileSync(path, "utf8");
      return (
        /^\s*icons:/m.test(source) && !source.includes("APP_ICONS_METADATA")
      );
    });
    expect(offenders).toEqual([]);
  });
});
