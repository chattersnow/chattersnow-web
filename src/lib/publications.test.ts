import { describe, expect, test } from "bun:test";
import {
  adjacentIssues,
  formatFileSize,
  parseRenditions,
  publicationImage,
} from "./publications";

const toUrl = (path: string) => `https://cdn.test/${path}`;

describe("parseRenditions", () => {
  test("keeps well-formed entries, smallest first", () => {
    expect(
      parseRenditions([
        { path: "b.webp", width: 960 },
        { path: "a.webp", width: 480 },
      ]),
    ).toEqual([
      { path: "a.webp", width: 480 },
      { path: "b.webp", width: 960 },
    ]);
  });

  test("drops anything malformed rather than throwing", () => {
    expect(parseRenditions(null)).toEqual([]);
    expect(parseRenditions({ path: "a", width: 1 })).toEqual([]);
    expect(
      parseRenditions([{ path: "a" }, { width: 480 }, { path: "b", width: 0 }]),
    ).toEqual([]);
  });
});

describe("publicationImage", () => {
  test("an image with no renditions has no srcSet", () => {
    expect(publicationImage("p.webp", 1600, 2263, [], toUrl)).toEqual({
      url: "https://cdn.test/p.webp",
      width: 1600,
      height: 2263,
    });
  });

  test("renditions and the original make the srcSet, once each", () => {
    const image = publicationImage(
      "p-1600.webp",
      1600,
      2263,
      [
        { path: "p-480.webp", width: 480 },
        { path: "p-960.webp", width: 960 },
      ],
      toUrl,
    );
    expect(image.srcSet).toBe(
      "https://cdn.test/p-480.webp 480w, https://cdn.test/p-960.webp 960w, https://cdn.test/p-1600.webp 1600w",
    );
  });
});

describe("formatFileSize", () => {
  test("reads the way a download button should", () => {
    expect(formatFileSize(200)).toBe("1 KB");
    expect(formatFileSize(820 * 1024)).toBe("820 KB");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2 MB");
    expect(formatFileSize(18 * 1024 * 1024 + 300_000)).toBe("18 MB");
  });
});

describe("adjacentIssues", () => {
  const issues = [
    { slug: "fall-2026" },
    { slug: "summer-2026" },
    { slug: "spring-2026" },
  ];

  test("newer is before in a newest-first list, older after", () => {
    expect(adjacentIssues(issues, "summer-2026")).toEqual({
      newer: { slug: "fall-2026" },
      older: { slug: "spring-2026" },
    });
  });

  test("the ends and an unknown slug have nothing on the missing side", () => {
    expect(adjacentIssues(issues, "fall-2026").newer).toBeNull();
    expect(adjacentIssues(issues, "spring-2026").older).toBeNull();
    expect(adjacentIssues(issues, "nope")).toEqual({
      newer: null,
      older: null,
    });
  });
});
