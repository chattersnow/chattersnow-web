import { describe, expect, test } from "bun:test";
import {
  EVENT_MEDIA_MAX_BYTES,
  eventMediaDownloadUrl,
  eventMediaExpiresSoon,
  eventMediaPath,
  eventMediaRetentionLabel,
  planEventMediaFile,
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
