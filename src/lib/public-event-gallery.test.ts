import { describe, expect, test } from "bun:test";
import {
  buildPublicEventMedia,
  PUBLIC_EVENT_MEDIA_REUSE_SECONDS,
  PUBLIC_EVENT_MEDIA_TTL_SECONDS,
  hasPublicEventMedia,
  publicEventMediaReuseBucket,
  publicEventMediaToSign,
  publicEventPhotoAlt,
  type PublicEventMediaRow,
} from "./public-event-gallery";

function row(overrides: Partial<PublicEventMediaRow>): PublicEventMediaRow {
  return {
    id: crypto.randomUUID(),
    kind: "photo",
    path: `t/e/${crypto.randomUUID()}.jpg`,
    content_type: "image/jpeg",
    caption: null,
    uploaded_at: "2026-10-18T19:30:00Z",
    ...overrides,
  };
}

describe("public event gallery", () => {
  const photos = [row({}), row({}), row({})];
  const video = row({ kind: "video", content_type: "video/mp4" });
  const rows = [photos[0], video, photos[1], photos[2]];

  test("a preview signs the newest photos and every video, counting all photos", () => {
    const picked = publicEventMediaToSign(rows, { offset: 0, limit: 2 });
    expect(picked.photos).toEqual([photos[0], photos[1]]);
    expect(picked.videos).toEqual([video]);
    expect(picked.photoCount).toBe(3);
  });

  test("a later page signs its own photos and leaves the videos to page one", () => {
    const picked = publicEventMediaToSign(rows, { offset: 2, limit: 2 });
    expect(picked.photos).toEqual([photos[2]]);
    expect(picked.videos).toEqual([]);
    expect(picked.photoCount).toBe(3);
  });

  test("a page past the end signs nothing but still counts", () => {
    const picked = publicEventMediaToSign(rows, { offset: 20, limit: 20 });
    expect(picked.photos).toEqual([]);
    expect(picked.photoCount).toBe(3);
  });

  test("the page's offset travels with it, for alt text", () => {
    const urls = new Map([[photos[2].path, "https://s/2"]]);
    expect(
      buildPublicEventMedia(rows, { offset: 2, limit: 2 }, urls).photoOffset,
    ).toBe(2);
  });

  test("a reused URL always has at least the reuse window left", () => {
    const start = Date.UTC(2026, 9, 23, 12, 0, 0);
    const windowMs = PUBLIC_EVENT_MEDIA_REUSE_SECONDS * 1000;
    expect(publicEventMediaReuseBucket(start)).toBe(start);
    expect(publicEventMediaReuseBucket(start + windowMs - 1)).toBe(start);
    expect(publicEventMediaReuseBucket(start + windowMs)).toBe(
      start + windowMs,
    );
    expect(
      PUBLIC_EVENT_MEDIA_TTL_SECONDS - PUBLIC_EVENT_MEDIA_REUSE_SECONDS,
    ).toBeGreaterThanOrEqual(PUBLIC_EVENT_MEDIA_REUSE_SECONDS);
  });

  test("what did not sign is left out, and the count stands", () => {
    const urls = new Map([
      [photos[0].path, "https://s/0"],
      [video.path, "https://s/v"],
    ]);
    const media = buildPublicEventMedia(rows, { offset: 0, limit: 20 }, urls);
    expect(media.photos).toEqual([
      { id: photos[0].id, url: "https://s/0", caption: null },
    ]);
    expect(media.videos).toEqual([
      { id: video.id, url: "https://s/v", caption: null },
    ]);
    expect(media.photoCount).toBe(3);
    expect(hasPublicEventMedia(media)).toBe(true);
  });

  test("nothing signed is nothing to show", () => {
    expect(
      hasPublicEventMedia(
        buildPublicEventMedia(rows, { offset: 0, limit: 20 }, new Map()),
      ),
    ).toBe(false);
  });

  test("alt text is the caption, else the photo's place in the event", () => {
    expect(publicEventPhotoAlt("Rail Jam", 0, 3, "  First drop ")).toBe(
      "First drop",
    );
    expect(publicEventPhotoAlt("Rail Jam", 1, 3, null)).toBe(
      "Photo 2 of 3 from Rail Jam",
    );
  });
});
