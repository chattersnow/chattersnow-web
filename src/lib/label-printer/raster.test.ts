import { describe, expect, test } from "bun:test";
import { bitmapGet } from "./bitmap";
import {
  fitFontSize,
  fitWithin,
  qrDrawSize,
  qrModules,
  stockDots,
  thresholdPixels,
  wrapText,
} from "./raster";

test("each stock is its size in dots at 8 dots/mm, never turned", () => {
  expect(stockDots({ widthMm: 50, heightMm: 80 })).toEqual({
    width: 400,
    height: 640,
  });
  expect(stockDots({ widthMm: 40, heightMm: 30 })).toEqual({
    width: 320,
    height: 240,
  });
});

describe("qrModules", () => {
  const svgUri = (svg: string) =>
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  test("reads the modules, quiet zone included, off the viewBox", () => {
    // A version 4 QR (33 modules) and its four-module quiet zone each side.
    const src = svgUri(
      '<svg viewBox="0 0 164 164" xmlns="http://www.w3.org/2000/svg"><path d="M16 148L44 148"/></svg>',
    );
    expect(qrModules(src)).toBe(41);
  });

  test("null for anything it can't read", () => {
    expect(qrModules("data:image/png;base64,AAAA")).toBeNull();
    expect(qrModules(svgUri("<svg></svg>"))).toBeNull();
    expect(qrModules(svgUri('<svg viewBox="0 0 163 163"></svg>'))).toBeNull();
    expect(qrModules("data:image/svg+xml,%E0%A4%A")).toBeNull();
  });
});

test("qrDrawSize gives every module the same whole number of dots", () => {
  expect(qrDrawSize(41, 296)).toBe(287); // 7 dots a module
  expect(qrDrawSize(41, 176)).toBe(164); // 4
  expect(qrDrawSize(null, 176)).toBe(176);
  expect(qrDrawSize(200, 176)).toBe(176);
});

describe("thresholdPixels", () => {
  test("gives a 1-bit bitmap of the canvas's size, dark pixels as ink", () => {
    const { width, height } = stockDots({ widthMm: 40, heightMm: 30 });
    const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
    const paint = (x: number, y: number, value: number, alpha = 255) => {
      const i = (y * width + x) * 4;
      rgba.set([value, value, value, alpha], i);
    };
    paint(0, 0, 0);
    paint(319, 239, 179); // just under the threshold
    paint(10, 10, 180); // at it: no ink
    paint(20, 20, 0, 0); // transparent black is the white label

    const bitmap = thresholdPixels(rgba, width, height);
    expect(bitmap.data).toHaveLength((width / 8) * height);
    expect(bitmap.data.every((byte) => byte >= 0 && byte <= 255)).toBe(true);
    expect(bitmapGet(bitmap, 0, 0)).toBe(true);
    expect(bitmapGet(bitmap, 319, 239)).toBe(true);
    expect(bitmapGet(bitmap, 10, 10)).toBe(false);
    expect(bitmapGet(bitmap, 20, 20)).toBe(false);
    const inked = [...bitmap.data].reduce(
      (sum, byte) => sum + byte.toString(2).replaceAll("0", "").length,
      0,
    );
    expect(inked).toBe(2);
  });
});

// One unit per character, so widths are easy to reason about.
const measure = (text: string) => text.length;

describe("wrapText", () => {
  test("wraps at spaces", () => {
    expect(wrapText("Winter jacket, navy blue", 12, measure, 3)).toEqual([
      "Winter",
      "jacket, navy",
      "blue",
    ]);
  });

  test("ends the last line with an ellipsis when the text runs over", () => {
    // A real description, not a tidy sample.
    const lines = wrapText(
      "Burton men's insulated snowboard jacket with removable hood, waterproof shell and a small tear on the left cuff",
      18,
      measure,
      3,
    );
    expect(lines).toHaveLength(3);
    expect(lines.every((line) => line.length <= 18)).toBe(true);
    expect(lines[2].endsWith("…")).toBe(true);
  });

  test("breaks a word longer than the line", () => {
    expect(wrapText("ABCDEFGHIJ", 4, measure, 5)).toEqual([
      "ABCD",
      "EFGH",
      "IJ",
    ]);
  });

  test("nothing to wrap, no lines", () => {
    expect(wrapText("   ", 10, measure, 3)).toEqual([]);
  });
});

test("fitFontSize shrinks until the text fits, and stops at the minimum", () => {
  const at = (text: string, size: number) => text.length * size * 0.6;
  expect(fitFontSize("CS1234", 144, 40, 14, at)).toBe(40);
  expect(fitFontSize("CS12345678AB", 144, 40, 14, at)).toBe(20);
  expect(fitFontSize("X".repeat(100), 144, 40, 14, at)).toBe(14);
});

test("fitWithin keeps a logo's proportions inside its band", () => {
  // Wide: the width is the limit.
  expect(fitWithin(400, 100, 208, 40)).toEqual({ width: 160, height: 40 });
  expect(fitWithin(1000, 100, 208, 40)).toEqual({ width: 208, height: 20.8 });
  // Square and tall: the height is.
  expect(fitWithin(64, 64, 208, 40)).toEqual({ width: 40, height: 40 });
  expect(fitWithin(50, 200, 208, 40)).toEqual({ width: 10, height: 40 });
});
