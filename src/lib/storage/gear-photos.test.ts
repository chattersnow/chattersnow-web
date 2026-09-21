import { describe, expect, test } from "bun:test";
import { gearPhotoPathFromUrl } from "./gear-photos";

describe("gearPhotoPathFromUrl", () => {
  const path =
    "11111111-2222-4333-8444-555555555555/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg";

  test("reads the object path out of a public URL", () => {
    expect(
      gearPhotoPathFromUrl(
        `https://abcdefgh.supabase.co/storage/v1/object/public/gear-photos/${path}`,
      ),
    ).toBe(path);
  });

  // The whole reason this matches on the path and not the URL: the same object
  // is served from the local stack, the hosted project and a custom domain, and
  // the purge job must recognise it as live under every one of them.
  test("recognises the same object on a different origin", () => {
    expect(
      gearPhotoPathFromUrl(
        `http://127.0.0.1:54321/storage/v1/object/public/gear-photos/${path}`,
      ),
    ).toBe(path);
  });

  test("ignores a query string", () => {
    expect(
      gearPhotoPathFromUrl(
        `https://abcdefgh.supabase.co/storage/v1/object/public/gear-photos/${path}?t=1`,
      ),
    ).toBe(path);
  });

  test("returns null for anything that isn't a gear photo", () => {
    expect(gearPhotoPathFromUrl(null)).toBeNull();
    expect(gearPhotoPathFromUrl("")).toBeNull();
    expect(
      gearPhotoPathFromUrl("https://drive.google.com/file/d/ABC123/view"),
    ).toBeNull();
    expect(gearPhotoPathFromUrl("/images/placeholder.png")).toBeNull();
    expect(
      gearPhotoPathFromUrl(
        "https://abcdefgh.supabase.co/storage/v1/object/public/other-bucket/x.jpg",
      ),
    ).toBeNull();
  });

  test("returns null for a bucket root with no object", () => {
    expect(
      gearPhotoPathFromUrl(
        "https://abcdefgh.supabase.co/storage/v1/object/public/gear-photos/",
      ),
    ).toBeNull();
  });
});
