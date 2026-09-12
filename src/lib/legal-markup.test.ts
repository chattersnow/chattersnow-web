import { describe, expect, test } from "bun:test";
import {
  isPublishableHref,
  legalPlainText,
  parseInline,
  parseLegalBlocks,
} from "@/lib/legal-markup";

describe("parseInline", () => {
  test("plain prose is one text run", () => {
    expect(parseInline("We keep what you send.")).toEqual([
      { kind: "text", text: "We keep what you send." },
    ]);
  });

  test("a link becomes a link run and the surrounding text survives", () => {
    expect(
      parseInline("Write to [us](mailto:privacy@example.org) any time."),
    ).toEqual([
      { kind: "text", text: "Write to " },
      {
        kind: "link",
        href: "mailto:privacy@example.org",
        runs: [{ kind: "text", text: "us" }],
      },
      { kind: "text", text: " any time." },
    ]);
  });

  test("bold becomes a strong run", () => {
    expect(parseInline("**Contact form** — 2 years.")).toEqual([
      { kind: "strong", runs: [{ kind: "text", text: "Contact form" }] },
      { kind: "text", text: " — 2 years." },
    ]);
  });

  test("bold and links mix in one line", () => {
    expect(
      parseInline("**Gear** at [/inventory](/inventory) is free."),
    ).toEqual([
      { kind: "strong", runs: [{ kind: "text", text: "Gear" }] },
      { kind: "text", text: " at " },
      {
        kind: "link",
        href: "/inventory",
        runs: [{ kind: "text", text: "/inventory" }],
      },
      { kind: "text", text: " is free." },
    ]);
  });

  // A tenant writes these documents; an href we would not publish must not
  // become a link, and must not silently vanish either.
  test("an href outside the allowlist stays literal text", () => {
    expect(parseInline("See [here](javascript:alert(1)) for more.")).toEqual([
      { kind: "text", text: "See [here](javascript:alert(1)) for more." },
    ]);
  });

  test("a protocol-relative href stays literal text", () => {
    expect(parseInline("[elsewhere](//evil.example)")).toEqual([
      { kind: "text", text: "[elsewhere](//evil.example)" },
    ]);
  });

  test("unmatched markers are text, not an error", () => {
    expect(parseInline("A [bracket and **a star")).toEqual([
      { kind: "text", text: "A [bracket and **a star" },
    ]);
  });

  test("parsing is not stateful across calls", () => {
    const line = "[one](/one) and [two](/two)";
    expect(parseInline(line)).toEqual(parseInline(line));
  });
});

describe("parseLegalBlocks", () => {
  test("a paragraph of bullets becomes a list", () => {
    expect(
      parseLegalBlocks([
        "- **Contact form messages** — 2 years.\n- **Volunteer applications** — 2 years.",
      ]),
    ).toEqual([
      {
        kind: "bullets",
        items: [
          [
            {
              kind: "strong",
              runs: [{ kind: "text", text: "Contact form messages" }],
            },
            { kind: "text", text: " — 2 years." },
          ],
          [
            {
              kind: "strong",
              runs: [{ kind: "text", text: "Volunteer applications" }],
            },
            { kind: "text", text: " — 2 years." },
          ],
        ],
      },
    ]);
  });

  // Prose that happens to contain a dashed line is prose. Rendering half of a
  // paragraph as a list would be a worse surprise than rendering none of it.
  test("a block that mixes bullets and prose stays one paragraph", () => {
    const blocks = parseLegalBlocks(["We keep this:\n- for 2 years."]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("paragraph");
  });

  test("each paragraph is its own block", () => {
    const blocks = parseLegalBlocks(["First.", "- one\n- two", "Last."]);
    expect(blocks.map((block) => block.kind)).toEqual([
      "paragraph",
      "bullets",
      "paragraph",
    ]);
  });

  test("an empty paragraph is a paragraph, not an empty list", () => {
    expect(parseLegalBlocks([""])).toEqual([{ kind: "paragraph", runs: [] }]);
  });
});

describe("isPublishableHref", () => {
  test.each([
    ["mailto:privacy@example.org", true],
    ["https://example.org/policy", true],
    ["/inventory/library", true],
    ["#other-agreements", true],
    ["#", false],
    ["mailto:", false],
    ["https://", false],
    ["http://example.org", false],
    ["//example.org", false],
    ["javascript:alert(1)", false],
    ["gears", false],
  ])("%s -> %s", (href, expected) => {
    expect(isPublishableHref(href)).toBe(expected);
  });
});

describe("legalPlainText", () => {
  test("takes every marker back off, nesting included", () => {
    expect(
      legalPlainText([
        "Write to [us](mailto:privacy@example.org).",
        "- **[Contact form](/contact)** — 2 years.\n- **Gear** — 3 years.",
      ]),
    ).toBe("Write to us.\nContact form — 2 years.\nGear — 3 years.");
  });
});
