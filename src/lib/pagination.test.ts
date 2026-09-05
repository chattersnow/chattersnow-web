import { describe, expect, test } from "bun:test";
import {
  PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  parsePerPage,
  pageRange,
  totalPagesFor,
} from "./pagination";

describe("parsePerPage", () => {
  test("takes a size this app actually offers", () => {
    expect(parsePerPage("25")).toBe(25);
    expect(parsePerPage("10")).toBe(10);
  });

  test("falls back to the default when the URL says nothing usable", () => {
    for (const raw of [undefined, "", "many", "0", "-5"]) {
      expect(parsePerPage(raw)).toBe(PAGE_SIZE);
    }
  });

  test("never hands back a size the selector has no item for", () => {
    // The value seeds the rows-per-page Select as well as the query, so a
    // hand-edited URL must still resolve to one of the offered options.
    for (const raw of ["1", "15", "24", "1000"]) {
      expect(PAGE_SIZE_OPTIONS).toContain(
        parsePerPage(raw) as (typeof PAGE_SIZE_OPTIONS)[number],
      );
    }
  });

  test("caps at the largest option however big the number is", () => {
    expect(parsePerPage("1000")).toBe(Math.max(...PAGE_SIZE_OPTIONS));
  });
});

describe("page arithmetic follows the chosen size", () => {
  test("ranges the rows the reader asked for", () => {
    expect(pageRange(3, 25)).toEqual({ offset: 50, to: 74 });
    expect(pageRange(1, 10)).toEqual({ offset: 0, to: 9 });
  });

  test("counts pages against that same size", () => {
    // A wrong size here silently drops the tail of a list: the pager stops
    // offering pages that the range query would still have returned.
    expect(totalPagesFor(312, 10)).toBe(32);
    expect(totalPagesFor(312, 25)).toBe(13);
    expect(totalPagesFor(0, 10)).toBe(1);
  });
});
