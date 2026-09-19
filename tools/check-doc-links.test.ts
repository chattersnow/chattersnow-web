import { describe, expect, test } from "bun:test";

import {
  anchorsOf,
  brokenLinksIn,
  headingSlug,
  linksOf,
  type Target,
} from "./check-doc-links";

const tree = (files: Record<string, string>) => {
  return (path: string): Target => {
    if (path in files) return { kind: "file", text: files[path] };
    if (Object.keys(files).some((f) => f.startsWith(`${path}/`)))
      return { kind: "directory" };
    return null;
  };
};

describe("headingSlug", () => {
  test("lowercases and hyphenates", () => {
    expect(headingSlug("5.9 People directory")).toBe("59-people-directory");
  });

  // The whole reason #1196 existed: the deleted character's spaces both
  // survive, so the anchor has two hyphens where the heading had one word gap.
  test("leaves a doubled hyphen where an em dash or slash was", () => {
    expect(headingSlug("6. Data model — Multi-tenancy")).toBe(
      "6-data-model--multi-tenancy",
    );
    expect(headingSlug("16.1 Incident / problem documentation")).toBe(
      "161-incident--problem-documentation",
    );
  });

  test("keeps hyphens already in the words", () => {
    expect(headingSlug("Multi-tenancy")).toBe("multi-tenancy");
  });
});

describe("anchorsOf", () => {
  test("strips the inline markup a heading's slug does not see", () => {
    expect(anchorsOf("## The `tenants` table")).toContain("the-tenants-table");
  });

  test("suffixes a repeated heading the way GitHub does", () => {
    const anchors = anchorsOf("## Notes\n\n## Notes\n\n## Notes\n");
    expect([...anchors]).toEqual(["notes", "notes-1", "notes-2"]);
  });

  test("ignores a heading inside a fenced code block", () => {
    expect(anchorsOf("```md\n## Not a heading\n```\n")).not.toContain(
      "not-a-heading",
    );
  });

  test("accepts an explicit HTML anchor", () => {
    expect(anchorsOf('<a id="hand-written"></a>')).toContain("hand-written");
  });
});

describe("linksOf", () => {
  test("reports the line each link sits on and skips code blocks", () => {
    expect(
      linksOf("intro\n\nsee [a](b.md#c)\n\n```\n[x](y.md)\n```\n"),
    ).toEqual([{ line: 3, target: "b.md#c" }]);
  });
});

describe("brokenLinksIn", () => {
  const files = {
    "docs/spec/multi-tenancy.md": "## 6. Data model — Multi-tenancy\n",
    "docs/spec/events.md": "",
  };

  test("passes a link whose anchor exists", () => {
    const broken = brokenLinksIn(
      "docs/technical-spec.md",
      "[§6](spec/multi-tenancy.md#6-data-model--multi-tenancy)",
      tree(files),
    );
    expect(broken).toEqual([]);
  });

  test("flags the single-hyphen form", () => {
    const broken = brokenLinksIn(
      "docs/technical-spec.md",
      "[§6](spec/multi-tenancy.md#6-data-model-multi-tenancy)",
      tree(files),
    );
    expect(broken).toHaveLength(1);
    expect(broken[0].reason).toContain("has no anchor");
  });

  test("flags a missing file", () => {
    const broken = brokenLinksIn(
      "docs/spec/people.md",
      "[gone](nowhere.md)",
      tree(files),
    );
    expect(broken[0].reason).toBe("no such file: docs/spec/nowhere.md");
  });

  test("resolves a same-file anchor against the file itself", () => {
    expect(brokenLinksIn("a.md", "## Scope\n\n[up](#scope)", tree({}))).toEqual(
      [],
    );
    expect(brokenLinksIn("a.md", "[up](#scope)", tree({}))).toHaveLength(1);
  });

  test("accepts a link to a directory, which has no anchors to check", () => {
    expect(
      brokenLinksIn(
        "docs/technical-spec.md",
        "[the files](spec/)",
        tree(files),
      ),
    ).toEqual([]);
  });

  test("leaves external links alone", () => {
    const markdown = "[gh](https://github.com/x#y) [mail](mailto:a@b.c)";
    expect(brokenLinksIn("README.md", markdown, tree({}))).toEqual([]);
  });
});
