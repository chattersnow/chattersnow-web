import { describe, expect, test } from "bun:test";
import {
  UPLOAD_LINK_ERRORS,
  UPLOAD_LINK_INVALID,
  defaultUploadLinkExpiry,
  uploadLinkError,
  uploadLinkPath,
  uploadLinkStatus,
} from "./event-media-upload-links";

const now = new Date("2026-10-20T12:00:00Z");

describe("defaultUploadLinkExpiry", () => {
  test("seven days after the event ends", () => {
    expect(
      defaultUploadLinkExpiry(
        { starts_at: "2026-11-01T18:00:00Z", ends_at: "2026-11-02T02:00:00Z" },
        now,
      ).toISOString(),
    ).toBe("2026-11-09T02:00:00.000Z");
  });

  test("seven days after the start when there is no end", () => {
    expect(
      defaultUploadLinkExpiry(
        { starts_at: "2026-11-01T18:00:00Z", ends_at: null },
        now,
      ).toISOString(),
    ).toBe("2026-11-08T18:00:00.000Z");
  });

  test("an event long past gets seven days from now, never a dead link", () => {
    expect(
      defaultUploadLinkExpiry(
        { starts_at: "2026-01-01T18:00:00Z", ends_at: null },
        now,
      ).toISOString(),
    ).toBe("2026-10-27T12:00:00.000Z");
  });
});

describe("uploadLinkStatus", () => {
  test("revoked wins over expired", () => {
    expect(
      uploadLinkStatus(
        {
          expires_at: "2026-01-01T00:00:00Z",
          revoked_at: "2025-12-01T00:00:00Z",
        },
        now,
      ),
    ).toBe("revoked");
    expect(
      uploadLinkStatus(
        { expires_at: "2026-01-01T00:00:00Z", revoked_at: null },
        now,
      ),
    ).toBe("expired");
    expect(
      uploadLinkStatus(
        { expires_at: "2026-12-01T00:00:00Z", revoked_at: null },
        now,
      ),
    ).toBe("active");
  });
});

describe("uploadLinkError", () => {
  test("matches the code inside a PostgREST message", () => {
    expect(uploadLinkError("LINK_INVALID", "x")).toBe(UPLOAD_LINK_INVALID);
    expect(uploadLinkError("OVER_CAP", "x")).toBe(UPLOAD_LINK_ERRORS.OVER_CAP);
    expect(uploadLinkError("something else", "fallback")).toBe("fallback");
  });
});

test("the page is under /portal, so every host serves it", () => {
  expect(uploadLinkPath("abc")).toBe("/portal/media-upload/abc");
});
