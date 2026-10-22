import { describe, expect, test } from "bun:test";
import {
  EVENT_MEDIA_SIGNED_URL_TTL_SECONDS,
  keepSignedUrls,
  EVENT_MEDIA_MAX_BYTES,
  eventMediaDownloadUrl,
  eventMediaExpiresSoon,
  eventMediaPath,
  eventMediaRetentionLabel,
  eventMediaThumbPath,
  planEventMediaFile,
  storedAsPickedType,
} from "./event-media-files";

const MB = 1024 * 1024;

describe("planEventMediaFile", () => {
  test("videos keep their own type", () => {
    expect(
      planEventMediaFile({ name: "a.mp4", type: "video/mp4", size: 900 * MB }),
    ).toEqual({ kind: "video", contentType: "video/mp4", extension: "mp4" });
    expect(
      planEventMediaFile({
        name: "IMG_0001.MOV",
        type: "video/quicktime",
        size: MB,
      }),
    ).toEqual({
      kind: "video",
      contentType: "video/quicktime",
      extension: "mov",
    });
  });

  test("a video with no declared type is read by its extension", () => {
    expect(
      planEventMediaFile({ name: "clip.MOV", type: "", size: MB }),
    ).toEqual({
      kind: "video",
      contentType: "video/quicktime",
      extension: "mov",
    });
  });

  test("photos become JPEG, or WebP when they may carry transparency", () => {
    expect(
      planEventMediaFile({ name: "a.jpg", type: "image/jpeg", size: MB }),
    ).toMatchObject({ kind: "photo", contentType: "image/jpeg" });
    expect(
      planEventMediaFile({ name: "a.png", type: "image/png", size: MB }),
    ).toMatchObject({ kind: "photo", contentType: "image/webp" });
  });

  test("HEIC is a photo stored as JPEG, typed or not", () => {
    for (const type of ["image/heic", ""]) {
      expect(
        planEventMediaFile({ name: "IMG_1.HEIC", type, size: 3 * MB }),
      ).toEqual({ kind: "photo", contentType: "image/jpeg", extension: "jpg" });
    }
  });

  test("refuses other types and oversized video", () => {
    expect(
      planEventMediaFile({ name: "a.pdf", type: "application/pdf", size: 1 }),
    ).toEqual({ error: "a.pdf is not a photo or a video." });
    expect(
      planEventMediaFile({ name: "a.mkv", type: "video/x-matroska", size: 1 }),
    ).toHaveProperty("error");
    expect(
      planEventMediaFile({
        name: "long.mp4",
        type: "video/mp4",
        size: EVENT_MEDIA_MAX_BYTES + 1,
      }),
    ).toEqual({ error: "long.mp4 is larger than 10 GB." });
  });
});

test("eventMediaPath is tenant / event / uuid.ext", () => {
  const tenant = crypto.randomUUID();
  const event = crypto.randomUUID();
  expect(eventMediaPath(tenant, event, "mp4")).toMatch(
    new RegExp(`^${tenant}/${event}/[0-9a-f-]{36}\\.mp4$`),
  );
});

describe("eventMediaDownloadUrl", () => {
  test("keeps the token and names the saved file", () => {
    const url = new URL(
      eventMediaDownloadUrl(
        "https://x.supabase.co/storage/v1/object/sign/event-media/t/e/a.jpg?token=abc",
        "Snow day #2.jpg",
      ),
    );
    expect(url.searchParams.get("token")).toBe("abc");
    expect(url.searchParams.get("download")).toBe("Snow day #2.jpg");
  });
});

describe("eventMediaRetentionLabel", () => {
  test("names indefinitely, whole years and days", () => {
    expect(eventMediaRetentionLabel(null)).toBe("Keep indefinitely");
    expect(eventMediaRetentionLabel(365)).toBe("1 year after the event");
    expect(eventMediaRetentionLabel(1825)).toBe("5 years after the event");
    expect(eventMediaRetentionLabel(90)).toBe("90 days after the event");
  });
});

describe("eventMediaExpiresSoon", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const inDays = (days: number) =>
    new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  test("is the 14-day window, past dates included", () => {
    expect(eventMediaExpiresSoon(inDays(14), now)).toBe(true);
    expect(eventMediaExpiresSoon(inDays(-1), now)).toBe(true);
    expect(eventMediaExpiresSoon(inDays(15), now)).toBe(false);
  });

  test("never for media kept indefinitely", () => {
    expect(eventMediaExpiresSoon(null, now)).toBe(false);
  });
});

describe("upload link originals (#1620)", () => {
  const keep = { keepOriginals: true };

  test("a JPEG, PNG or WebP is stored as picked, marked original", () => {
    expect(
      planEventMediaFile(
        { name: "a.jpg", type: "image/jpeg", size: 30 * MB },
        keep,
      ),
    ).toEqual({
      kind: "photo",
      contentType: "image/jpeg",
      extension: "jpg",
      original: true,
    });
    expect(
      planEventMediaFile({ name: "a.png", type: "image/png", size: MB }, keep),
    ).toMatchObject({ contentType: "image/png", extension: "png" });
    expect(
      planEventMediaFile({ name: "a.webp", type: "", size: MB }, keep),
    ).toMatchObject({ contentType: "image/webp", extension: "webp" });
  });

  test("HEIC is converted to JPEG, still as an original", () => {
    expect(
      planEventMediaFile(
        { name: "a.HEIC", type: "image/heic", size: MB },
        keep,
      ),
    ).toMatchObject({ contentType: "image/jpeg", original: true });
    expect(storedAsPickedType({ name: "a.heic", type: "image/heic" })).toBe(
      undefined,
    );
  });

  test("a blank type falls back to the extension", () => {
    expect(storedAsPickedType({ name: "DSC_1.JPG", type: "" })).toBe(
      "image/jpeg",
    );
    expect(
      storedAsPickedType({ name: "x.png", type: "application/octet-stream" }),
    ).toBe("image/png");
  });

  test("without the option, photos are still re-encoded as before", () => {
    expect(
      planEventMediaFile({ name: "a.png", type: "image/png", size: MB }),
    ).toEqual({ kind: "photo", contentType: "image/webp", extension: "webp" });
  });

  test("the thumbnail sits beside the original", () => {
    expect(eventMediaThumbPath("t/e/abc.png")).toBe("t/e/abc-thumb.jpg");
  });
});

describe("keepSignedUrls", () => {
  const hour = EVENT_MEDIA_SIGNED_URL_TTL_SECONDS * 1000;
  const minute = 60 * 1000;
  const row = (
    id: string,
    token: string,
  ): {
    id: string;
    url: string | null;
    display_url: string | null;
    download_url: string | null;
  } => ({
    id,
    url: `https://s.test/${id}?token=${token}`,
    display_url: `https://s.test/${id}-thumb?token=${token}`,
    download_url: `https://s.test/${id}?token=${token}&download=${id}`,
  });

  test("a row still on screen keeps its URLs; a new one takes the fresh ones", () => {
    const held = [{ ...row("a", "old"), signedAt: 0 }];
    const merged = keepSignedUrls(
      held,
      [row("b", "new"), row("a", "new")],
      5 * minute,
      5 * minute,
    );
    expect(merged).toEqual([
      { ...row("b", "new"), signedAt: 5 * minute },
      { ...row("a", "old"), signedAt: 0 },
    ]);
  });

  test("a URL with under ten minutes left is replaced", () => {
    const held = [{ ...row("a", "old"), signedAt: 0 }];
    const now = hour - 9 * minute;
    expect(keepSignedUrls(held, [row("a", "new")], now, now)).toEqual([
      { ...row("a", "new"), signedAt: now },
    ]);
  });

  test("a row that failed to sign is signed again; a deleted one is dropped", () => {
    const held = [
      { ...row("a", "old"), url: null, signedAt: 0 },
      { ...row("gone", "old"), signedAt: 0 },
    ];
    expect(keepSignedUrls(held, [row("a", "new")], 1, 1)).toEqual([
      { ...row("a", "new"), signedAt: 1 },
    ]);
  });
});
