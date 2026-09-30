import { describe, expect, test } from "bun:test";
import {
  adjacentIssues,
  byFileName,
  formatFileSize,
  isValidPublicationSlug,
  moveItem,
  pagesMissingText,
  parseRenditions,
  publicationImage,
  publicationSlugify,
  renditionWidths,
  suggestPublicationSlug,
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

describe("suggestPublicationSlug", () => {
  test("joins the season and the publish date's year", () => {
    expect(suggestPublicationSlug("Fall", "2026-09-22")).toBe("fall-2026");
    expect(suggestPublicationSlug("Late Winter", "2027-02-01")).toBe(
      "late-winter-2027",
    );
  });

  test("does not repeat a year the season label already carries", () => {
    expect(suggestPublicationSlug("Fall 2026", "2026-09-22")).toBe("fall-2026");
  });

  test("falls back to whichever half exists", () => {
    expect(suggestPublicationSlug("Fall", "")).toBe("fall");
    expect(suggestPublicationSlug("", "2026-09-22")).toBe("2026");
    expect(suggestPublicationSlug("  ", "")).toBe("");
  });
});

describe("publicationSlugify", () => {
  test("produces what the database's slug check accepts", () => {
    const slug = publicationSlugify("  Été — Issue #3!  ");
    expect(slug).toBe("ete-issue-3");
    expect(isValidPublicationSlug(slug)).toBe(true);
  });

  test("never ends on a hyphen after truncation", () => {
    const slug = publicationSlugify(`${"a".repeat(79)} b`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(isValidPublicationSlug(slug)).toBe(true);
  });

  test("isValidPublicationSlug refuses what the database would", () => {
    expect(isValidPublicationSlug("Fall-2026")).toBe(false);
    expect(isValidPublicationSlug("fall--2026")).toBe(false);
    expect(isValidPublicationSlug("-fall")).toBe(false);
    expect(isValidPublicationSlug("a".repeat(81))).toBe(false);
  });
});

describe("byFileName", () => {
  test("orders numbered scans the way a person numbered them", () => {
    const names = ["page-10.jpg", "page-2.jpg", "Page-1.jpg", "cover.jpg"];
    expect(
      byFileName(names.map((name) => ({ name }))).map((f) => f.name),
    ).toEqual(["cover.jpg", "Page-1.jpg", "page-2.jpg", "page-10.jpg"]);
  });
});

describe("renditionWidths", () => {
  test("stores every target for a large scan", () => {
    expect(renditionWidths(3000)).toEqual([480, 960, 1600]);
  });

  test("never enlarges, and keeps a small scan at its own width", () => {
    expect(renditionWidths(1200)).toEqual([480, 960, 1200]);
    expect(renditionWidths(300)).toEqual([300]);
    expect(renditionWidths(1600)).toEqual([480, 960, 1600]);
  });
});

describe("moveItem", () => {
  test("moves one entry and leaves the rest in order", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  test("clamps a move past either end and ignores a bad source", () => {
    expect(moveItem(["a", "b"], 0, 9)).toEqual(["b", "a"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("pagesMissingText", () => {
  test("counts pages lacking either alt text or a transcript", () => {
    expect(
      pagesMissingText([
        { altText: "Cover", transcript: "Words" },
        { altText: " ", transcript: "Words" },
        { altText: "Page 3", transcript: "" },
      ]),
    ).toBe(2);
  });
});
