import { describe, expect, test } from "bun:test";
import {
  MAX_MOUNTAIN_NAME_LENGTH,
  MAX_MOUNTAINS,
  parseMountainInput,
  parseMountainList,
} from "./rider-profile";

describe("parseMountainList", () => {
  test("keeps the stored order", () => {
    expect(parseMountainList(["Hunter", "Windham"])).toEqual([
      "Hunter",
      "Windham",
    ]);
  });

  test("reads anything that is not a list of names as no list", () => {
    expect(parseMountainList(null)).toEqual([]);
    expect(parseMountainList({ a: 1 })).toEqual([]);
    expect(parseMountainList(["Hunter", 3, "", null])).toEqual(["Hunter"]);
  });
});

describe("parseMountainInput", () => {
  test("one name per line, trimmed, blank lines dropped", () => {
    expect(parseMountainInput("  Hunter \n\nWindham\r\nBelleayre\n")).toEqual({
      mountains: ["Hunter", "Windham", "Belleayre"],
    });
  });

  test("an empty list is allowed: Other is then the only choice", () => {
    expect(parseMountainInput("\n \n")).toEqual({ mountains: [] });
  });

  test("refuses the same name twice, ignoring case", () => {
    expect(parseMountainInput("Hunter\nhunter")).toEqual({
      error: "“hunter” is listed twice.",
    });
  });

  test("refuses Other, which the pickers add themselves", () => {
    expect("error" in parseMountainInput("Hunter\nother")).toBe(true);
  });

  test("refuses a name longer than the database allows", () => {
    const long = "x".repeat(MAX_MOUNTAIN_NAME_LENGTH + 1);
    expect("error" in parseMountainInput(long)).toBe(true);
    expect(
      parseMountainInput("x".repeat(MAX_MOUNTAIN_NAME_LENGTH)),
    ).not.toHaveProperty("error");
  });

  test("refuses more names than the database allows", () => {
    const names = Array.from({ length: MAX_MOUNTAINS + 1 }, (_, i) => `M${i}`);
    expect(parseMountainInput(names.join("\n"))).toEqual({
      error: `List up to ${MAX_MOUNTAINS} mountains.`,
    });
  });
});
