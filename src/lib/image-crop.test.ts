import { describe, expect, test } from "bun:test";
import {
  boostThumbnail,
  cropBoxStyle,
  cropObjectPosition,
  cropZoom,
  fitCrop,
  MAX_ZOOM,
  parseImageCrop,
  scaleSizes,
  withImageCrop,
  type ImageCrop,
} from "./image-crop";

const PHOTO = "https://drive.google.com/thumbnail?id=ABC123&sz=w1000";

/** The worked example from #1250: a 4/3 rect low and left of centre. */
const CROP: ImageCrop = { x: 0.18, y: 0.26, w: 0.64, h: 0.4288 };

describe("parseImageCrop", () => {
  test("round-trips a crop through the URL", () => {
    const stored = withImageCrop(PHOTO, CROP);
    expect(stored).toBe(`${PHOTO}#crop=0.1800,0.2600,0.6400,0.4288`);
    expect(parseImageCrop(stored)).toEqual({ src: PHOTO, crop: CROP });
  });

  test("reports no crop for a bare URL or a null one", () => {
    expect(parseImageCrop(PHOTO)).toEqual({ src: PHOTO, crop: null });
    expect(parseImageCrop(null)).toEqual({ src: null, crop: null });
  });

  // A hand-edited value must never be able to take a public page down, and a
  // fragment we do not understand must stay visible rather than be eaten.
  test.each([
    ["three numbers", "#crop=0.1,0.2,0.3"],
    ["five numbers", "#crop=0.1,0.2,0.3,0.4,0.5"],
    ["not numbers", "#crop=garbage"],
    ["NaN", "#crop=NaN,0,0.5,0.5"],
    ["an empty slot", "#crop=,0,0.5,0.5"],
    ["a negative origin", "#crop=-0.1,0,0.5,0.5"],
    ["out of range", "#crop=0,0,1.5,0.5"],
    ["x + w past the edge", "#crop=0.8,0,0.4,0.5"],
    ["zero width", "#crop=0.1,0.1,0,0.5"],
    ["zero height", "#crop=0.1,0.1,0.5,0"],
  ])("leaves a URL cropped with %s untouched", (_label, fragment) => {
    const url = `${PHOTO}${fragment}`;
    expect(parseImageCrop(url)).toEqual({ src: url, crop: null });
  });

  test("keeps a fragment that is not ours", () => {
    const url = `${PHOTO}#gid=1`;
    expect(parseImageCrop(url)).toEqual({ src: url, crop: null });
  });

  // "Never cropped" and "cropped then reset" have to render identically, so the
  // identity rect is reported as no crop at all.
  test("treats the identity rect as no crop", () => {
    expect(parseImageCrop(`${PHOTO}#crop=0.0000,0.0000,1.0000,1.0000`)).toEqual(
      { src: PHOTO, crop: null },
    );
  });
});

describe("withImageCrop", () => {
  test("serialises to four decimals, so float noise cannot mark a slot dirty", () => {
    const stored = withImageCrop(PHOTO, { x: 1 / 3, y: 0, w: 2 / 3, h: 0.5 });
    expect(stored).toBe(`${PHOTO}#crop=0.3333,0.0000,0.6667,0.5000`);

    const { crop } = parseImageCrop(stored);
    expect(withImageCrop(PHOTO, crop!)).toBe(stored);
  });

  test("stores the identity rect as a bare URL", () => {
    expect(withImageCrop(PHOTO, { x: 0, y: 0, w: 1, h: 1 })).toBe(PHOTO);
    expect(withImageCrop(PHOTO, null)).toBe(PHOTO);
  });

  test("replaces an existing crop rather than stacking one", () => {
    const first = withImageCrop(PHOTO, CROP);
    expect(withImageCrop(first, { x: 0, y: 0, w: 0.5, h: 0.5 })).toBe(
      `${PHOTO}#crop=0.0000,0.0000,0.5000,0.5000`,
    );
    expect(withImageCrop(first, null)).toBe(PHOTO);
  });

  // Clearing is the careful direction: it must not eat a fragment it does not
  // own. Setting a crop does take the fragment slot, since the two cannot coexist.
  test("leaves a foreign fragment alone on reset and claims it on set", () => {
    expect(withImageCrop(`${PHOTO}#gid=1`, null)).toBe(`${PHOTO}#gid=1`);
    expect(withImageCrop(`${PHOTO}#gid=1`, CROP)).toBe(
      `${PHOTO}#crop=0.1800,0.2600,0.6400,0.4288`,
    );
  });
});

describe("cropBoxStyle", () => {
  test("scales and offsets the box so the rect lands on the frame", () => {
    expect(cropBoxStyle(CROP)).toEqual({
      left: "-28.125%",
      top: "-60.6343%",
      width: "156.25%",
      height: "233.209%",
    });
  });

  test("is a no-op box for a full-frame rect", () => {
    expect(cropBoxStyle({ x: 0, y: 0, w: 1, h: 1 })).toEqual({
      left: "0%",
      top: "0%",
      width: "100%",
      height: "100%",
    });
  });
});

describe("cropObjectPosition", () => {
  test("is the rect's centre", () => {
    expect(cropObjectPosition(CROP)).toBe("50% 47.44%");
    expect(cropObjectPosition({ x: 0.6, y: 0.2, w: 0.2, h: 0.2 })).toBe(
      "70% 30%",
    );
  });
});

describe("scaleSizes", () => {
  // The real string from src/app/(public)/about/team/team-members.tsx.
  test("widens every length in a real sizes attribute", () => {
    expect(
      scaleSizes(
        "(min-width: 768px) 160px, (min-width: 640px) 144px, 96px",
        1 / 0.64,
      ),
    ).toBe("(min-width: 768px) 250px, (min-width: 640px) 225px, 150px");
  });

  test("handles vw and a bare default", () => {
    expect(scaleSizes("(min-width: 1024px) 20vw, 50vw", 2)).toBe(
      "(min-width: 1024px) 40vw, 100vw",
    );
    expect(scaleSizes("100vw", 1.5)).toBe("150vw");
  });

  test("passes an entry it cannot parse through untouched", () => {
    expect(scaleSizes("(min-width: 640px) calc(50vw - 2rem), 100vw", 2)).toBe(
      "(min-width: 640px) calc(50vw - 2rem), 200vw",
    );
  });

  test("clamps the factor to [1, 8] and leaves the string alone at 1", () => {
    expect(scaleSizes("100px", 0.5)).toBe("100px");
    expect(scaleSizes("100px", 40)).toBe("800px");
    expect(scaleSizes("100px", Number.NaN)).toBe("100px");
  });
});

describe("fitCrop", () => {
  // z = 1 is the largest rect of the target aspect that fits -- exactly what
  // plain `object-cover` shows today.
  test("at zoom 1 reproduces object-cover for a portrait in a square", () => {
    expect(fitCrop(0.75, 1, 1, 0.5, 0.5)).toEqual({
      x: 0,
      y: 0.125,
      w: 1,
      h: 0.75,
    });
  });

  test("at zoom 1 reproduces object-cover for a landscape in a square", () => {
    expect(fitCrop(2, 1, 1, 0.5, 0.5)).toEqual({
      x: 0.25,
      y: 0,
      w: 0.5,
      h: 1,
    });
  });

  test("locks the rect to the target aspect at every zoom", () => {
    for (const zoom of [1, 1.5, 2, 4]) {
      const crop = fitCrop(0.75, 4 / 3, zoom, 0.5, 0.5);
      // Pixel aspect of the rect = (w/h) * imageAspect.
      expect((crop.w / crop.h) * 0.75).toBeCloseTo(4 / 3, 3);
    }
  });

  test("clamps the rect inside the image at all four edges", () => {
    const low = fitCrop(0.75, 1, 2, -5, -5);
    expect(low).toEqual({ x: 0, y: 0, w: 0.5, h: 0.375 });

    const high = fitCrop(0.75, 1, 2, 5, 5);
    expect(high).toEqual({ x: 0.5, y: 0.625, w: 0.5, h: 0.375 });
  });

  test("clamps zoom to [1, MAX_ZOOM]", () => {
    expect(fitCrop(1, 1, 0.1, 0.5, 0.5)).toEqual(fitCrop(1, 1, 1, 0.5, 0.5));
    expect(fitCrop(1, 1, 99, 0.5, 0.5)).toEqual(
      fitCrop(1, 1, MAX_ZOOM, 0.5, 0.5),
    );
  });
});

describe("cropZoom", () => {
  test("round-trips fitCrop", () => {
    for (const [image, target] of [
      [0.75, 1],
      [2, 1],
      [1, 4 / 3],
      [4 / 3, 2],
    ]) {
      for (const zoom of [1, 1.5, 2, MAX_ZOOM]) {
        const crop = fitCrop(image, target, zoom, 0.5, 0.5);
        // Loose by design: the stored rect is quantised to four decimals, so a
        // zoom read back off it is accurate to about a thousandth, not exact.
        expect(cropZoom(crop, image, target)).toBeCloseTo(zoom, 2);
      }
    }
  });
});

describe("boostThumbnail", () => {
  test("asks Drive for more pixels only when a crop magnifies them", () => {
    expect(boostThumbnail(PHOTO, CROP)).toBe(
      "https://drive.google.com/thumbnail?id=ABC123&sz=w1600",
    );
    expect(boostThumbnail(PHOTO, null)).toBe(PHOTO);
    expect(boostThumbnail(PHOTO, { x: 0, y: 0.1, w: 1, h: 0.5 })).toBe(PHOTO);
  });

  test("leaves a non-Drive URL alone", () => {
    expect(boostThumbnail("https://example.com/a.jpg", CROP)).toBe(
      "https://example.com/a.jpg",
    );
  });
});
