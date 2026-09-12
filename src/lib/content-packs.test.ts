import { describe, expect, test } from "bun:test";
import {
  contentPackSlugify,
  isValidContentPackKey,
  takenSlugsFromError,
  toAdoptionSummary,
  toAvailableContentPack,
} from "@/lib/content-packs";

describe("toAvailableContentPack", () => {
  test("defaults the counts a fresh pack has no rows for", () => {
    expect(
      toAvailableContentPack({
        id: "p1",
        key: "starter",
        name: "Starter",
        description: null,
        category_count: null,
        article_count: null,
        adopted_at: null,
      }),
    ).toEqual({
      id: "p1",
      key: "starter",
      name: "Starter",
      description: "",
      categoryCount: 0,
      articleCount: 0,
      adoptedAt: null,
    });
  });
});

describe("toAdoptionSummary", () => {
  test("reads what the RPC reports", () => {
    expect(
      toAdoptionSummary({
        pack_key: "starter",
        pack_name: "Starter",
        categories: 3,
        articles: 11,
      }),
    ).toEqual({ packName: "Starter", categories: 3, articles: 11 });
  });

  test("refuses anything that is not a summary", () => {
    expect(toAdoptionSummary(null)).toBeNull();
    expect(toAdoptionSummary("ok")).toBeNull();
    expect(toAdoptionSummary({ categories: 1 })).toBeNull();
  });
});

describe("takenSlugsFromError", () => {
  test("names the addresses the adoption refused to overwrite", () => {
    expect(
      takenSlugsFromError(
        "raise exception SLUG_TAKEN: getting-started, volunteering",
      ),
    ).toEqual(["getting-started", "volunteering"]);
  });

  test("is null for every other failure, so they get the generic message", () => {
    expect(takenSlugsFromError("NO_PACK")).toBeNull();
    expect(takenSlugsFromError("permission denied")).toBeNull();
  });
});

describe("pack keys", () => {
  test("are slugs, the same shape a category address is", () => {
    expect(contentPackSlugify("Snow Sports Basics")).toBe("snow-sports-basics");
    expect(isValidContentPackKey("snow-sports-basics")).toBe(true);
    expect(isValidContentPackKey("Snow Sports")).toBe(false);
    expect(isValidContentPackKey("")).toBe(false);
  });
});
