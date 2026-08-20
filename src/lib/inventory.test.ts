import { describe, expect, test } from "bun:test";
import { CONDITIONS, GENDERS, labelFor, resolveImageUrl } from "@/lib/inventory";

describe("resolveImageUrl", () => {
  test("returns null for null input", () => {
    expect(resolveImageUrl(null)).toBeNull();
  });

  test("returns non-drive urls unchanged", () => {
    expect(resolveImageUrl("https://example.com/photo.jpg")).toBe(
      "https://example.com/photo.jpg",
    );
  });

  test("rewrites a /file/d/<id>/view share link to the thumbnail endpoint", () => {
    const input = "https://drive.google.com/file/d/ABC123xyz/view?usp=sharing";
    expect(resolveImageUrl(input)).toBe(
      "https://drive.google.com/thumbnail?id=ABC123xyz&sz=w1000",
    );
  });

  test("rewrites a ?id=<id> share link to the thumbnail endpoint", () => {
    const input = "https://drive.google.com/open?id=XYZ789";
    expect(resolveImageUrl(input)).toBe(
      "https://drive.google.com/thumbnail?id=XYZ789&sz=w1000",
    );
  });

  test("falls back to the original url when no file id is found", () => {
    const input = "https://drive.google.com/drive/folders/abc";
    expect(resolveImageUrl(input)).toBe(input);
  });
});

describe("labelFor", () => {
  test("returns null when value is null", () => {
    expect(labelFor(CONDITIONS, null)).toBeNull();
  });

  test("returns the matching label", () => {
    expect(labelFor(CONDITIONS, "like_new")).toBe("Like new");
  });

  test("falls back to the raw value when there is no match", () => {
    expect(labelFor(GENDERS, "unknown")).toBe("unknown");
  });
});
