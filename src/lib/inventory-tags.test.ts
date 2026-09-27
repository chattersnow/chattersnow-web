import { describe, expect, test } from "bun:test";
import {
  formatNumberedTag,
  parseNumberedTag,
  parseScannedTag,
  removeTagsMessage,
  tagUrl,
  toReleasedTags,
} from "./inventory-tags";

describe("parseScannedTag", () => {
  test("a tag URL yields its asset-tag code, upper-cased", () => {
    expect(
      parseScannedTag("https://portal.example.org/portal/t/4f7k2q", {
        host: "portal.example.org",
      }),
    ).toEqual({ asset_tag: "4F7K2Q" });
  });

  test("a bare path is what the resolver route hands over", () => {
    expect(parseScannedTag("/portal/t/SEED01")).toEqual({
      asset_tag: "SEED01",
    });
  });

  test("the short form a portal host redirects to is a tag URL too", () => {
    expect(parseScannedTag("https://portal.example.org/t/4F7K2Q")).toEqual({
      asset_tag: "4F7K2Q",
    });
  });

  test("a tag URL on another host resolves to nothing", () => {
    expect(
      parseScannedTag("https://portal.other.org/portal/t/4F7K2Q", {
        host: "portal.example.org",
      }),
    ).toEqual({});
  });

  test("a URL that is not a tag URL resolves to nothing", () => {
    expect(parseScannedTag("https://example.org/portal/home")).toEqual({});
    expect(parseScannedTag("https://example.org/portal/t/")).toEqual({});
    expect(parseScannedTag("https://example.org/portal/t/a%2Fb")).toEqual({});
    expect(parseScannedTag("/portal/t/%E0%A4%A")).toEqual({});
  });

  test("a bare code from a keyboard-wedge scanner is an asset tag", () => {
    expect(parseScannedTag("  4f7k2q\n")).toEqual({ asset_tag: "4F7K2Q" });
  });

  test("a UPC could be an asset tag or a barcode, so both are tried", () => {
    expect(parseScannedTag("012345678905")).toEqual({
      asset_tag: "012345678905",
      barcode: "012345678905",
    });
  });

  test("an NFC serial is upper-cased to match how it is stored", () => {
    expect(parseScannedTag("04:a2:3b:9c:11:22:80")).toEqual({
      nfc: "04:A2:3B:9C:11:22:80",
    });
  });

  test("anything else is not a tag", () => {
    expect(parseScannedTag("")).toEqual({});
    expect(parseScannedTag("   ")).toEqual({});
    expect(parseScannedTag("abc")).toEqual({});
    expect(parseScannedTag("not a code")).toEqual({});
    expect(parseScannedTag("value.eq.x),or(")).toEqual({});
  });
});

describe("tagUrl", () => {
  test("builds the URL a label encodes", () => {
    expect(tagUrl("https://portal.example.org/", "4F7K2Q")).toBe(
      "https://portal.example.org/portal/t/4F7K2Q",
    );
  });

  test("round-trips through parseScannedTag", () => {
    const url = tagUrl("https://portal.example.org", "4F7K2Q");
    expect(parseScannedTag(url, { host: "portal.example.org" })).toEqual({
      asset_tag: "4F7K2Q",
    });
  });
});

describe("numbered codes (#1444)", () => {
  test("every way of writing 7 is 7, prefix or not", () => {
    for (const typed of ["7", "007", "CSN-7", "csn007", "CSN-007", " csn 7 "]) {
      expect(parseNumberedTag(typed)?.number).toBe(7);
    }
    expect(parseNumberedTag("csn-007")).toEqual({ prefix: "CSN", number: 7 });
    expect(parseNumberedTag("17")).toEqual({ prefix: null, number: 17 });
  });

  test("zero, a longer prefix and a random code are not numbered codes", () => {
    for (const typed of ["0", "000", "CSNX-7", "4F7K2Q", "7A", "", "-7"]) {
      expect(parseNumberedTag(typed)).toBeNull();
    }
  });

  test("the printed form pads to three digits and keeps counting past 999", () => {
    expect(formatNumberedTag("CSN", 7)).toBe("CSN-007");
    expect(formatNumberedTag("CSN", 42)).toBe("CSN-042");
    expect(formatNumberedTag("CSN", 1000)).toBe("CSN-1000");
  });

  test("a tag URL with a hyphen carries a numbered code, one without a random code", () => {
    expect(parseScannedTag("/portal/t/CSN-007")).toEqual({
      numbered: "CSN-007",
    });
    expect(
      parseScannedTag("https://portal.example.org/t/csn-1000", {
        host: "portal.example.org",
      }),
    ).toEqual({ numbered: "CSN-1000" });
    expect(parseScannedTag("/portal/t/4F7K2Q")).toEqual({
      asset_tag: "4F7K2Q",
    });
    // Digits only, with no hyphen, is a random code's shape in a URL.
    expect(parseScannedTag("/portal/t/234567")).toEqual({
      asset_tag: "234567",
    });
  });

  test("a numbered URL on another host resolves to nothing", () => {
    expect(
      parseScannedTag("https://portal.other.org/portal/t/CSN-007", {
        host: "portal.example.org",
      }),
    ).toEqual({});
  });

  test("a typed number can be a numbered code, and six digits a random one too", () => {
    expect(parseScannedTag("7")).toEqual({ numbered: "7" });
    expect(parseScannedTag("csn-7")).toEqual({ numbered: "CSN-7" });
    expect(parseScannedTag("234567")).toEqual({
      asset_tag: "234567",
      numbered: "234567",
    });
  });

  test("tagUrl keeps a numbered code's hyphen", () => {
    expect(tagUrl("https://portal.example.org", "CSN-007")).toBe(
      "https://portal.example.org/portal/t/CSN-007",
    );
  });
});

describe("removeTagsMessage", () => {
  test("nothing freed, nothing to say", () => {
    expect(removeTagsMessage([])).toBeNull();
  });

  test("names each tag and the item it is on", () => {
    expect(
      removeTagsMessage([{ code: "CSN-007", description: "Burton helmet" }]),
    ).toBe("Remove tag CSN-007 from Burton helmet before it goes out.");
    expect(
      removeTagsMessage([
        { code: "CSN-007", description: "Helmet" },
        { code: "CSN-012", description: "Goggles" },
      ]),
    ).toBe(
      "Remove these tags before the gear goes out: CSN-007 from Helmet, CSN-012 from Goggles.",
    );
  });

  test("toReleasedTags keeps only well-formed rows", () => {
    expect(
      toReleasedTags([
        { code: "CSN-007", description: "Helmet", item_id: "x" },
        { code: 7 },
        null,
      ]),
    ).toEqual([{ code: "CSN-007", description: "Helmet" }]);
    expect(toReleasedTags(null)).toEqual([]);
  });
});
