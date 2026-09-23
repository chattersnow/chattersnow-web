import { describe, expect, test } from "bun:test";
import { parseScannedTag, tagUrl } from "./inventory-tags";

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
