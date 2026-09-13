import { describe, expect, test } from "bun:test";
import { bioParagraphs } from "./team-data";

describe("bioParagraphs", () => {
  test("a blank line starts a new paragraph", () => {
    expect(bioParagraphs("First.\n\nSecond.\n\n\nThird.")).toEqual([
      "First.",
      "Second.",
      "Third.",
    ]);
  });

  test("a single newline is a soft wrap, not a paragraph", () => {
    expect(bioParagraphs("One line\nstill one paragraph.")).toEqual([
      "One line\nstill one paragraph.",
    ]);
  });

  test("whitespace-only lines are breaks, not paragraphs", () => {
    expect(bioParagraphs("  First.  \n \n  \nSecond.  ")).toEqual([
      "First.",
      "Second.",
    ]);
  });

  test("no bio is an empty list, the shape a bio-less copy row has", () => {
    expect(bioParagraphs(null)).toEqual([]);
    expect(bioParagraphs("")).toEqual([]);
    expect(bioParagraphs("   \n\n  ")).toEqual([]);
  });
});
