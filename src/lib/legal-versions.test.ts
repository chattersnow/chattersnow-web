import { describe, expect, test } from "bun:test";
import {
  legalVersionPath,
  selectLegalVersion,
  type PublishedLegalVersion,
} from "@/lib/legal-versions";

const version = (n: number): PublishedLegalVersion => ({
  version: n,
  effective_at: `2026-0${n}-01T12:00:00Z`,
  time_zone: "America/Denver",
  content: {
    title: "Privacy Policy",
    last_updated: `Month ${n}, 2026`,
    summary: [],
    sections: [{ id: "scope", title: "Scope", paragraphs: [`v${n}`] }],
  },
});

// Newest first, as the read returns them.
const versions = [version(3), version(2), version(1)];

describe("selectLegalVersion", () => {
  test("finds the version a parameter names", () => {
    expect(selectLegalVersion(versions, "2")?.version).toBe(2);
  });

  test("has no answer when no parameter was given", () => {
    // The live document is the caller's own case: this function must not
    // quietly hand back the newest version, or `/privacy` would start
    // rendering a snapshot instead of what the tenant is serving.
    expect(selectLegalVersion(versions, undefined)).toBeUndefined();
    expect(selectLegalVersion(versions, "")).toBeUndefined();
  });

  test("refuses a version this organization never published", () => {
    expect(selectLegalVersion(versions, "4")).toBeUndefined();
  });

  test("refuses anything that is not a whole version number", () => {
    // Each of these would otherwise coerce to something: Number("") is 0,
    // Number(" 2 ") is 2, and Number("2.0") is an integer. A permalink that
    // serves version 2 for "2.0" or for "  2" is two addresses for one
    // document, and `?version=0` or `?version=-1` names nothing at all.
    for (const bad of ["0", "-1", "2.5", "two", " ", "1e0", "0x2"]) {
      expect(selectLegalVersion(versions, bad), bad).toBeUndefined();
    }
  });

  test("refuses a repeated parameter", () => {
    // `?version=1&version=2` arrives as an array. Picking one of the two is a
    // guess, and this page is the one place guessing is not allowed.
    expect(selectLegalVersion(versions, ["1", "2"])).toBeUndefined();
  });

  test("has nothing to find in an empty history", () => {
    expect(selectLegalVersion([], "1")).toBeUndefined();
  });
});

describe("legalVersionPath", () => {
  test("is the document's own route with a version on it", () => {
    // The same shape as /giveaways/<id>/rules?version=N (#1322): the permalink
    // is the live route, which is what keeps #859's adoption gate covering it.
    expect(legalVersionPath("/privacy", 2)).toBe("/privacy?version=2");
    expect(legalVersionPath("/code-of-conduct", 11)).toBe(
      "/code-of-conduct?version=11",
    );
  });
});
