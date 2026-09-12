import { describe, expect, test } from "bun:test";
import {
  articleSlugify,
  emptyArticleBody,
  isValidArticleBody,
  isValidArticleCategoryBody,
  isValidArticleSlug,
  resolveArticleCategories,
} from "./articles";

const BODY = {
  title: "First day",
  description: "What to expect.",
  paragraphs: ["One.", "Two."],
  list: [{ label: "Arrive early", text: "Give yourself time." }],
  links: [{ label: "Programs", href: "/programs", internal: true }],
  disclaimer: "Not advice.",
};

describe("isValidArticleBody", () => {
  test("accepts the shape the renderer consumes", () => {
    expect(isValidArticleBody(BODY)).toBe(true);
    expect(isValidArticleBody(emptyArticleBody())).toBe(true);
  });

  test("accepts a link with no internal flag", () => {
    expect(
      isValidArticleBody({
        ...BODY,
        links: [{ label: "NSAA", href: "https://example.org/" }],
      }),
    ).toBe(true);
  });

  test.each([
    ["a missing field", { ...BODY, disclaimer: undefined }],
    ["paragraphs that are not strings", { ...BODY, paragraphs: [1] }],
    ["a list item missing its text", { ...BODY, list: [{ label: "x" }] }],
    ["a link missing its address", { ...BODY, links: [{ label: "x" }] }],
    [
      "an internal flag that is not a boolean",
      {
        ...BODY,
        links: [{ label: "x", href: "/y", internal: "yes" }],
      },
    ],
    ["null", null],
    ["an array", [BODY]],
  ])("rejects %s", (_name, value) => {
    expect(isValidArticleBody(value)).toBe(false);
  });
});

describe("isValidArticleCategoryBody", () => {
  test("wants a title and a description, and nothing else", () => {
    expect(
      isValidArticleCategoryBody({ title: "Learn", description: "Guides." }),
    ).toBe(true);
    expect(isValidArticleCategoryBody({ title: "Learn" })).toBe(false);
  });
});

describe("slugs", () => {
  test("slugify produces what the database constraint accepts", () => {
    for (const input of [
      "Getting Started",
      "Gear & Sizing",
      "  Mountain  Basics  ",
      "Snow Sports on a Budget",
    ]) {
      const slug = articleSlugify(input);
      expect(isValidArticleSlug(slug)).toBe(true);
    }
  });

  test("rejects the shapes the constraint would reject", () => {
    for (const bad of [
      "",
      "Getting-Started",
      "getting_started",
      "-leading",
      "trailing-",
      "double--hyphen",
    ]) {
      expect(isValidArticleSlug(bad)).toBe(false);
    }
  });
});

describe("resolveArticleCategories", () => {
  const category = {
    id: "c1",
    slug: "getting-started",
    value: { title: "Getting Started", description: "Start here." },
  };

  test("attaches each article to its category", () => {
    const [resolved] = resolveArticleCategories(
      [category],
      [{ id: "a1", category_id: "c1", anchor: "first-day", value: BODY }],
    );
    expect(resolved.title).toBe("Getting Started");
    expect(resolved.articles).toEqual([
      { ...BODY, id: "a1", anchor: "first-day" },
    ]);
  });

  test("drops a row whose body does not parse rather than rendering it", () => {
    // There is no default to fall back to, unlike a content slot, so a row
    // edited by hand into the wrong shape is skipped.
    const resolved = resolveArticleCategories(
      [category, { id: "c2", slug: "broken", value: { title: 3 } }],
      [
        { id: "a1", category_id: "c1", anchor: "ok", value: BODY },
        { id: "a2", category_id: "c1", anchor: "bad", value: { title: "x" } },
      ],
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0].articles.map((a) => a.anchor)).toEqual(["ok"]);
  });

  test("a category with no articles still renders", () => {
    const [resolved] = resolveArticleCategories([category], []);
    expect(resolved.articles).toEqual([]);
  });
});
