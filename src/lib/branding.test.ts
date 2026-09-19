import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  DARK_ACCENT,
  DARK_DEEP,
  DEFAULT_TYPOGRAPHY,
  EMPTY_BRANDING,
  TYPOGRAPHY_FAMILIES,
  TYPOGRAPHY_SETS,
  accentStops,
  brandColorPairs,
  brandingCss,
  brandingFromRows,
  darkVariantHex,
  normalizeHexColor,
  resolvedTypography,
  typographySet,
} from "./branding";

describe("brandingFromRows", () => {
  test("keeps valid colours, accent stops and the logo", () => {
    const branding = brandingFromRows([
      { token: "primary", value: "#112233" },
      { token: "accent_stops", value: ["#aabbcc", "#ddeeff"] },
      {
        token: "logo_url",
        value: "https://drive.google.com/file/d/abc123/view",
      },
    ]);
    expect(branding.colors).toEqual({ primary: "#112233" });
    expect(branding.accentStops).toEqual(["#aabbcc", "#ddeeff"]);
    expect(branding.logoUrl).toBe(
      "https://drive.google.com/thumbnail?id=abc123&sz=w1000",
    );
  });

  test("drops anything that is not a six-digit hex colour", () => {
    const branding = brandingFromRows([
      { token: "primary", value: "red" },
      { token: "primary_deep", value: "#FFF" },
      { token: "background", value: "#123456; } body { display: none" },
      { token: "accent_stops", value: ["#aabbcc", "url(evil)"] },
      { token: "unknown", value: "#123456" },
      { token: "logo_url", value: "" },
    ]);
    expect(branding.colors).toEqual({});
    expect(branding.accentStops).toEqual(["#aabbcc"]);
    expect(branding.logoUrl).toBeNull();
  });
});

describe("brandingCss", () => {
  test("is empty when nothing is set", () => {
    expect(brandingCss(EMPTY_BRANDING)).toBe("");
  });

  test("overrides the stylesheet tokens and derives the rest", () => {
    const css = brandingCss({
      colors: { primary: "#112233", primary_deep: "#001122" },
      accentStops: ["#aabbcc", "#ddeeff"],
      logoUrl: null,
      appIconUrl: null,
      typography: null,
    });
    expect(css).toContain("--purple: #112233;");
    expect(css).toContain("--purple-deep: #001122;");
    expect(css).toContain("--foreground: #001122;");
    expect(css).toContain(
      "--line: color-mix(in srgb, #001122 14%, transparent);",
    );
    expect(css).toContain(
      "--rainbow: linear-gradient(90deg, #aabbcc 0%, #ddeeff 100%);",
    );
    expect(css).toContain(".dark {");
  });

  // #819. Both selectors are specificity (0,1,0) and this block is injected
  // after the stylesheet, so a bare `:root` wins the tie against globals.css's
  // `.dark` for every token the dark half does not restate -- `--background`
  // among them, which turned dark mode light for any tenant that set one.
  test("the light palette cannot reach a dark page", () => {
    const css = brandingCss({
      colors: {
        primary: "#112233",
        primary_deep: "#001122",
        background: "#ffeeff",
      },
      accentStops: null,
      logoUrl: null,
      appIconUrl: null,
      typography: null,
    });
    expect(css).toContain(":root:not(.dark) {");
    expect(css).not.toContain(":root {");
    const dark = css.slice(css.indexOf(".dark {"));
    expect(dark).not.toContain("--background:");
    expect(dark).not.toContain("--foreground:");
  });

  // The dark accent keeps the brand's hue, takes globals.css's own dark
  // lightness, and caps the chroma, so a tenant setting Chatter Snow's palette
  // reproduces Chatter Snow's dark mode. A white mix could not: it drops
  // chroma as it raises lightness, and missed `#c8a8ea` at every percentage.
  // The cap is a `min()` rather than a flat value so that the platform's own
  // near-neutral palette is not pushed *up* into a colour it never had.
  test("derives the dark accent from the brand's hue, not from white", () => {
    const css = brandingCss({
      colors: { primary: "#70419a", primary_deep: "#32134f" },
      accentStops: null,
      logoUrl: null,
      appIconUrl: null,
      typography: null,
    });
    expect(css).toContain(
      "--purple: oklch(from #70419a 0.783 min(c, 0.098) h);",
    );
    expect(css).toContain(
      "--purple-deep: oklch(from #32134f 0.884 min(c, 0.055) h);",
    );
    expect(css).not.toContain("white");
  });

  // `--rainbow` is the one brand token globals.css does not restate under
  // `.dark`, so with the light block scoped away from dark pages the dark
  // block has to carry it or the tenant's accent reverts to the stylesheet's.
  test("carries the accent gradient into dark mode", () => {
    const css = brandingCss({
      colors: {},
      accentStops: ["#aabbcc", "#ddeeff"],
      logoUrl: null,
      appIconUrl: null,
      typography: null,
    });
    const dark = css.slice(css.indexOf(".dark {"));
    expect(dark).toContain(
      "--rainbow: linear-gradient(90deg, #aabbcc 0%, #ddeeff 100%);",
    );
    expect(dark).toContain("--rainbow-soft:");
  });

  test("a single accent colour still paints as a gradient", () => {
    const css = brandingCss({
      colors: {},
      accentStops: ["#aabbcc"],
      logoUrl: null,
      appIconUrl: null,
      typography: null,
    });
    expect(css).toContain("linear-gradient(90deg, #aabbcc 0%, #aabbcc 0%)");
  });
});

describe("normalizeHexColor", () => {
  test("lowercases and trims a valid colour, rejects anything else", () => {
    expect(normalizeHexColor(" #AABBCC ")).toBe("#aabbcc");
    expect(normalizeHexColor("#abc")).toBeNull();
    expect(normalizeHexColor("aabbcc")).toBeNull();
  });
});

describe("darkVariantHex", () => {
  /**
   * The whole point of this function is that /brand can print a hex a designer
   * pastes into Canva, where the browser's `oklch(from ...)` is only a swatch.
   * That is worth having only if the two agree, so it is pinned to values
   * globals.css has already written down rather than to whatever it returns.
   */
  test("reproduces the .dark literals globals.css derives", () => {
    // globals.css:286-287, which record the expression beside each value.
    expect(darkVariantHex("#475569", DARK_ACCENT)).toBe("#aabad1");
    expect(darkVariantHex("#1e293b", DARK_DEEP)).toBe("#cbdaf2");
  });

  test("reproduces the accent Chatter Snow's palette lands on", () => {
    // The DARK_ACCENT comment states this must come out as rgb(200, 168, 234).
    expect(darkVariantHex("#70419a", DARK_ACCENT)).toBe("#c8a8ea");
  });

  test("keeps a near-neutral neutral rather than turning it blue", () => {
    // The reason the chroma is clamped rather than set: #475569 forced to
    // 0.098 would be #90bbf7. Its own chroma is smaller, so it survives.
    expect(darkVariantHex("#475569", DARK_ACCENT)).not.toBe("#90bbf7");
  });
});

describe("brandColorPairs", () => {
  test("falls back to the stylesheet's value for an unset token", () => {
    const pairs = brandColorPairs({
      ...EMPTY_BRANDING,
      colors: { primary: "#0b7285" },
    });

    expect(pairs.find((p) => p.token.key === "primary")?.value).toBe("#0b7285");
    // Unset: the guide documents what a visitor sees, not what was overridden.
    expect(pairs.find((p) => p.token.key === "background")?.value).toBe(
      "#f7f0ff",
    );
  });

  test("gives a dark form only to the two tokens that have one", () => {
    const pairs = brandColorPairs(EMPTY_BRANDING);
    const withDark = pairs.filter((pair) => pair.darkHex !== null);

    expect(withDark.map((pair) => pair.token.key)).toEqual([
      "primary",
      "primary_deep",
    ]);
    // The rest keep the stylesheet's neutral surfaces in dark mode, which the
    // page has to say rather than leave as a blank half-swatch.
    expect(pairs.every((pair) => (pair.dark === null) === (pair.darkHex === null))).toBe(true); // prettier-ignore
  });
});

describe("accentStops", () => {
  test("spaces however many stops the tenant set", () => {
    expect(
      accentStops({
        ...EMPTY_BRANDING,
        accentStops: ["#111111", "#222222", "#333333", "#444444"],
      }).map((stop) => stop.position),
    ).toEqual([0, 33, 67, 100]);
  });

  test("falls back to the platform's six", () => {
    expect(accentStops(EMPTY_BRANDING)).toHaveLength(6);
  });
});

describe("typography", () => {
  test("every set resolves to three families and a tracking value", () => {
    expect(TYPOGRAPHY_SETS.length).toBe(5);
    for (const set of TYPOGRAPHY_SETS) {
      // `accent` is the one optional role, and an unset one falls back to
      // `heading` rather than to nothing -- which is what keeps
      // `--brand-font-accent` resolvable for every set.
      const accent = set.accent ?? set.heading;
      for (const family of [set.sans, set.heading, accent]) {
        expect(family.name.length).toBeGreaterThan(0);
        expect(family.cssVar).toMatch(/^--font-[a-z0-9-]+$/);
      }
      expect(set.headingTracking).toMatch(/^-?\d*\.?\d+em$/);
      // The labels describe the typography and never an organization: a set
      // named after the first tenant would appear on everybody else's
      // settings screen.
      expect(set.label).not.toMatch(/chatter/i);
      expect(set.key).not.toMatch(/chatter/i);
    }
  });

  test("keys are unique and the default is one of them", () => {
    const keys = TYPOGRAPHY_SETS.map((set) => set.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(DEFAULT_TYPOGRAPHY.key);
  });

  test("every family a set names is loaded by the root layout", () => {
    // The registry can only offer what `next/font/google` was called with,
    // because it is a compile-time transform over literal arguments. A set
    // naming a variable nothing declares renders the browser's default font
    // and looks like a CSS bug rather than a missing import.
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    for (const family of TYPOGRAPHY_FAMILIES) {
      expect(layout).toContain(`variable: "${family.cssVar}"`);
    }
  });

  test("the option families are not preloaded", () => {
    // `next/font` preloads every family a root layout declares, on every
    // route, so the obvious wiring would have each visitor fetch eight
    // typefaces to render two. Counted rather than asserted per family: the
    // point is that no call was left without it.
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    const declarations = layout.match(/variable: "--font-/g) ?? [];
    const optedOut = layout.match(/\n  preload: false,/g) ?? [];
    expect(declarations.length).toBe(TYPOGRAPHY_FAMILIES.length);
    expect(optedOut.length).toBe(declarations.length);
  });

  test("an unknown or malformed value resolves to nothing", () => {
    expect(typographySet("rounded")?.key).toBe("rounded");
    expect(typographySet("ROUNDED")).toBeNull();
    expect(typographySet("comic-sans")).toBeNull();
    expect(typographySet("")).toBeNull();
    expect(typographySet(null)).toBeNull();
    expect(typographySet(42)).toBeNull();
    expect(typographySet({ key: "rounded" })).toBeNull();
  });

  test("an unset or rejected set renders the platform's own", () => {
    expect(resolvedTypography(EMPTY_BRANDING)).toBe(DEFAULT_TYPOGRAPHY);
    expect(
      resolvedTypography(brandingFromRows([{ token: "typography", value: 7 }])),
    ).toBe(DEFAULT_TYPOGRAPHY);
    expect(DEFAULT_TYPOGRAPHY.key).toBe("neutral");
  });

  test("nothing outside the registry reaches the style block", () => {
    for (const value of [
      "quicksand, sans-serif; } body { display: none",
      "var(--font-quicksand)",
      "comic-sans",
    ]) {
      const branding = brandingFromRows([{ token: "typography", value }]);
      expect(branding.typography).toBeNull();
      expect(brandingCss(branding)).toBe("");
    }
  });

  test("a set emits the three roles and its heading tracking", () => {
    const css = brandingCss(
      brandingFromRows([{ token: "typography", value: "rounded" }]),
    );
    expect(css).toContain("--brand-font-sans: var(--font-quicksand);");
    expect(css).toContain("--brand-font-heading: var(--font-quicksand);");
    expect(css).toContain("--brand-font-accent: var(--font-rock-salt);");
    expect(css).toContain("--brand-heading-tracking: -0.04em;");
    // A plain `:root`, not `:root:not(.dark)`: a dark page is set in the same
    // families as a light one.
    expect(css).toContain(":root { --brand-font-sans");
  });

  test("a set without an accent falls back to its heading", () => {
    const css = brandingCss(
      brandingFromRows([{ token: "typography", value: "editorial" }]),
    );
    expect(css).toContain("--brand-font-heading: var(--font-source-serif);");
    expect(css).toContain("--brand-font-accent: var(--font-source-serif);");
    expect(css).toContain("--brand-font-sans: var(--font-inter);");
  });

  test("typography and colours land in their own blocks", () => {
    const css = brandingCss(
      brandingFromRows([
        { token: "typography", value: "friendly" },
        { token: "primary", value: "#112233" },
      ]),
    );
    expect(css).toContain(":root { --brand-font-sans: var(--font-figtree);");
    expect(css).toContain(":root:not(.dark) { --purple: #112233;");
  });
});
