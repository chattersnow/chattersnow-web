import { describe, expect, test } from "bun:test";
import { splitPageRange } from "./list-order";

describe("splitPageRange", () => {
  test("a page wholly inside the upcoming half reads only upcoming", () => {
    expect(splitPageRange(0, 9, 25)).toEqual({
      upcoming: { from: 0, to: 9 },
      past: null,
    });
  });

  test("a page straddling the boundary reads the tail of one and the head of the other", () => {
    expect(splitPageRange(20, 29, 25)).toEqual({
      upcoming: { from: 20, to: 24 },
      past: { from: 0, to: 4 },
    });
  });

  test("a page past the boundary reads only past, offset by the upcoming count", () => {
    expect(splitPageRange(30, 39, 25)).toEqual({
      upcoming: null,
      past: { from: 5, to: 14 },
    });
  });

  test("with no upcoming events every page is past", () => {
    expect(splitPageRange(0, 9, 0)).toEqual({
      upcoming: null,
      past: { from: 0, to: 9 },
    });
  });

  test("a page ending exactly on the boundary leaves past alone", () => {
    expect(splitPageRange(10, 19, 20)).toEqual({
      upcoming: { from: 10, to: 19 },
      past: null,
    });
  });
});
