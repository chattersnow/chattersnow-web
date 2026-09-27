import { describe, expect, test } from "bun:test";
import { bitmapBytesPerRow, bitmapGet, type Bitmap } from "./bitmap";
import {
  RASTER_SIZE,
  UPRIGHT_SIZE,
  fitFontSize,
  fitWithin,
  rotateClockwise,
  thresholdPixels,
  wrapText,
} from "./raster";

test("a 50 × 30 mm label is 400 × 240 dots at 8 dots/mm", () => {
  expect(RASTER_SIZE).toEqual({ width: 400, height: 240 });
});

test("the label is drawn upright, taller than it is wide", () => {
  expect(UPRIGHT_SIZE).toEqual({ width: 240, height: 400 });
});

describe("rotateClockwise", () => {
  function bitmapWith(width: number, height: number, dots: [number, number][]) {
    const stride = bitmapBytesPerRow(width);
    const data = new Uint8Array(stride * height);
    for (const [x, y] of dots) data[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
    return { width, height, data } satisfies Bitmap;
  }

  test("turns the upright label to lie the way the stock runs", () => {
    const { width, height } = UPRIGHT_SIZE;
    // The top-left corner, and a dot near the bottom-right.
    const turned = rotateClockwise(
      bitmapWith(width, height, [
        [0, 0],
        [width - 2, height - 1],
      ]),
    );
    expect({ width: turned.width, height: turned.height }).toEqual(RASTER_SIZE);
    // The label's top is the right-hand edge.
    expect(bitmapGet(turned, RASTER_SIZE.width - 1, 0)).toBe(true);
    expect(bitmapGet(turned, 0, RASTER_SIZE.height - 2)).toBe(true);
    const inked = [...turned.data].reduce(
      (sum, byte) => sum + byte.toString(2).replaceAll("0", "").length,
      0,
    );
    expect(inked).toBe(2);
  });

  test("four turns come back to the start", () => {
    const start = bitmapWith(13, 5, [
      [0, 0],
      [12, 4],
      [7, 2],
    ]);
    let bitmap: Bitmap = start;
    for (let i = 0; i < 4; i++) bitmap = rotateClockwise(bitmap);
    expect(bitmap).toEqual(start);
  });
});

describe("thresholdPixels", () => {
  test("gives a 1-bit bitmap of the canvas's size, dark pixels as ink", () => {
    const { width, height } = RASTER_SIZE;
    const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
    const paint = (x: number, y: number, value: number, alpha = 255) => {
      const i = (y * width + x) * 4;
      rgba.set([value, value, value, alpha], i);
    };
    paint(0, 0, 0);
    paint(399, 239, 179); // just under the threshold
    paint(10, 10, 180); // at it: no ink
    paint(20, 20, 0, 0); // transparent black is the white label

    const bitmap = thresholdPixels(rgba, width, height);
    expect(bitmap.data).toHaveLength((width / 8) * height);
    expect(bitmap.data.every((byte) => byte >= 0 && byte <= 255)).toBe(true);
    expect(bitmapGet(bitmap, 0, 0)).toBe(true);
    expect(bitmapGet(bitmap, 399, 239)).toBe(true);
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
