import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The status colours fail in a way axe only catches by luck: a `success`
 * badge has to be on screen, in the light theme, on a route the scan visits,
 * for a near miss like 4.38:1 to surface at all (#660). The tokens are worth
 * measuring directly, so a shade chosen for looks can't quietly slip under AA
 * again.
 */
const css = readFileSync(join(import.meta.dirname, "globals.css"), "utf8");
const lightTokens = css.slice(css.indexOf(":root {"), css.indexOf("\n}"));

function optionalToken(name: string) {
  const match = lightTokens.match(
    new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"),
  );
  return match ? hexToRgb(match[1]) : null;
}

function token(name: string) {
  const colour = optionalToken(name);
  if (!colour) throw new Error(`--${name} is not a plain hex colour in :root`);
  return colour;
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance([r, g, b]: Rgb) {
  const [rl, gl, bl] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrast(a: Rgb, b: Rgb) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (hi + 0.05) / (lo + 0.05);
}

/** The `bg-<token>/10` tint the badges and the destructive button use. */
function tintOver(colour: Rgb, base: Rgb): Rgb {
  return colour.map((c, i) => 0.1 * c + 0.9 * base[i]) as Rgb;
}

const AA_NORMAL_TEXT = 4.5;

describe("light-theme status colours", () => {
  // The page background is the harder of the two and the one the earlier
  // values missed -- every tinted badge outside a card sits on it.
  const backgrounds = {
    card: token("surface"),
    page: token("background"),
  };

  for (const name of ["success", "warning", "destructive"] as const) {
    const colour = token(name);

    for (const [where, base] of Object.entries(backgrounds)) {
      test(`--${name} reads as 12px text on its own tint over the ${where}`, () => {
        expect(contrast(colour, tintOver(colour, base))).toBeGreaterThanOrEqual(
          AA_NORMAL_TEXT,
        );
      });
    }

    // Not every status colour declares a foreground here -- shadcn's
    // stylesheet supplies destructive's -- so only assert on the ones this
    // file owns.
    const foreground = optionalToken(`${name}-foreground`);
    if (foreground) {
      test(`--${name}-foreground reads on solid --${name}`, () => {
        expect(contrast(foreground, colour)).toBeGreaterThanOrEqual(
          AA_NORMAL_TEXT,
        );
      });
    }
  }
});
