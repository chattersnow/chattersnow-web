import { describe, expect, test } from "bun:test";
import { photosZipName, uniqueFilenames } from "./event-media-zip";

describe("uniqueFilenames", () => {
  test("keeps distinct names as they are", () => {
    expect(uniqueFilenames(["a.jpg", "b.jpg"])).toEqual(["a.jpg", "b.jpg"]);
  });

  test("numbers repeats before the extension, ignoring case", () => {
    expect(
      uniqueFilenames(["IMG_0001.jpg", "img_0001.JPG", "IMG_0001.jpg"]),
    ).toEqual(["IMG_0001.jpg", "img_0001 (2).JPG", "IMG_0001 (3).jpg"]);
  });

  test("does not collide with a name that already looks numbered", () => {
    expect(uniqueFilenames(["a (2).jpg", "a.jpg", "a.jpg"])).toEqual([
      "a (2).jpg",
      "a.jpg",
      "a (3).jpg",
    ]);
  });

  test("never lets a name reach outside the archive's root", () => {
    expect(uniqueFilenames(["../x.jpg", ""])).toEqual([".._x.jpg", "photo"]);
  });
});

describe("photosZipName", () => {
  test("drops characters a filesystem refuses", () => {
    expect(photosZipName("Winter Social: 2026/27")).toBe(
      "Winter Social 2026 27 photos.zip",
    );
    expect(photosZipName("  ")).toBe("Event photos.zip");
  });
});
