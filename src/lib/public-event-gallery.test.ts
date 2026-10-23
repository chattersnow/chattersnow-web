import { describe, expect, test } from "bun:test";
import {
  buildPublicEventMedia,
  hasPublicEventMedia,
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
    const picked = publicEventMediaToSign(rows, 2);
    expect(picked.photos).toEqual([photos[0], photos[1]]);
    expect(picked.videos).toEqual([video]);
    expect(picked.photoCount).toBe(3);
  });

  test("no limit is the whole gallery", () => {
    expect(publicEventMediaToSign(rows, null).photos).toHaveLength(3);
  });

  test("what did not sign is left out, and the count stands", () => {
    const urls = new Map([
      [photos[0].path, "https://s/0"],
      [video.path, "https://s/v"],
    ]);
    const media = buildPublicEventMedia(rows, null, urls);
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
      hasPublicEventMedia(buildPublicEventMedia(rows, null, new Map())),
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
