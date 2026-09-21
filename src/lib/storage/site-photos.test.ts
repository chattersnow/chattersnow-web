import { describe, expect, test } from "bun:test";
import { SITE_PHOTO_MAX_EDGE, sitePhotoPathFromUrl } from "./site-photos";

describe("sitePhotoPathFromUrl", () => {
  const path =
    "11111111-2222-4333-8444-555555555555/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg";

  test("reads the object path out of a public URL", () => {
    expect(
      sitePhotoPathFromUrl(
        `https://abcdefgh.supabase.co/storage/v1/object/public/site-photos/${path}`,
      ),
    ).toBe(path);
  });

  // The whole reason this matches on the path and not the URL: the same object
  // is served from the local stack, the hosted project and a custom domain.
  test("recognises the same object on a different origin", () => {
    expect(
      sitePhotoPathFromUrl(
        `http://127.0.0.1:54321/storage/v1/object/public/site-photos/${path}`,
      ),
    ).toBe(path);
  });

  // The one thing a gear photo's URL never carries. A slot's stored value is
  // the photo *and* its crop rect, and the field asks this about the value it
  // is replacing -- so a cropped photo that this session uploaded has to be
  // recognised as its own, or it is never cleaned up.
  test("ignores a #crop= fragment", () => {
    expect(
      sitePhotoPathFromUrl(
        `https://abcdefgh.supabase.co/storage/v1/object/public/site-photos/${path}#crop=0.1,0.2,0.5,0.5`,
      ),
    ).toBe(path);
  });

  test("ignores a query string", () => {
    expect(
      sitePhotoPathFromUrl(
        `https://abcdefgh.supabase.co/storage/v1/object/public/site-photos/${path}?t=1`,
      ),
    ).toBe(path);
  });

  test("returns null for anything that isn't a site photo", () => {
    expect(sitePhotoPathFromUrl(null)).toBeNull();
    expect(sitePhotoPathFromUrl("")).toBeNull();
    expect(
      sitePhotoPathFromUrl("https://drive.google.com/file/d/ABC123/view"),
    ).toBeNull();
    expect(sitePhotoPathFromUrl("/images/placeholder.png")).toBeNull();
    // A gear photo in particular: the two buckets have separate purge rules,
    // and this must never claim one of those as its own.
    expect(
      sitePhotoPathFromUrl(
        "https://abcdefgh.supabase.co/storage/v1/object/public/gear-photos/x.jpg",
      ),
    ).toBeNull();
  });

  test("returns null for a bucket root with no object", () => {
    expect(
      sitePhotoPathFromUrl(
        "https://abcdefgh.supabase.co/storage/v1/object/public/site-photos/",
      ),
    ).toBeNull();
  });
});

describe("SITE_PHOTO_MAX_EDGE", () => {
  // Free-tier arithmetic, asserted rather than left in a comment: at q0.8 this
  // is ~400-700 KB a photo and there are 46 image slots, so a tenant's whole
  // set is ~28 MB against Supabase Free's 1 GB. Raising this is allowed; doing
  // it without redoing that sum is not.
  test("stays within what the free tier allows for a set of slots", () => {
    expect(SITE_PHOTO_MAX_EDGE).toBeGreaterThan(1600);
    expect(SITE_PHOTO_MAX_EDGE).toBeLessThanOrEqual(3000);
  });
});
