import { describe, expect, test } from "bun:test";
import {
  EMPTY_BRANDING,
  brandingCss,
  brandingFromRows,
  normalizeHexColor,
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
