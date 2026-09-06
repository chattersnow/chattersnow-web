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
