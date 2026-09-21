import { describe, expect, test } from "bun:test";
import { targetDimensions } from "./compress-image";

describe("targetDimensions", () => {
  test("caps the longest edge and keeps the aspect ratio", () => {
    expect(targetDimensions(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(targetDimensions(3024, 4032)).toEqual({ width: 1200, height: 1600 });
    expect(targetDimensions(2000, 2000)).toEqual({ width: 1600, height: 1600 });
  });

  test("never upscales an image already under the cap", () => {
    expect(targetDimensions(800, 600)).toEqual({ width: 800, height: 600 });
    expect(targetDimensions(1600, 900)).toEqual({ width: 1600, height: 900 });
  });

  // A canvas of zero width throws, so an extreme panorama must not round its
  // short edge down to nothing.
  test("keeps the short edge at least one pixel", () => {
    expect(targetDimensions(16000, 3)).toEqual({ width: 1600, height: 1 });
  });

  test("honours a caller-supplied cap", () => {
    expect(targetDimensions(4000, 2000, 400)).toEqual({
      width: 400,
      height: 200,
    });
  });
});
