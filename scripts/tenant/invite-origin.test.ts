import { describe, expect, test } from "bun:test";
import { inviteOrigin } from "./invite-origin";

describe("inviteOrigin", () => {
  test("prefers the tenant's own domain", () => {
    expect(inviteOrigin("example.org", "https://chattersnow.org")).toBe(
      "https://example.org",
    );
  });

  test("falls back to the site URL when the tenant has no domain", () => {
    expect(inviteOrigin(null, "https://chattersnow.org")).toBe(
      "https://chattersnow.org",
    );
  });

  // The case this file exists for: provisioning without --domain against an
  // env file that carries no NEXT_PUBLIC_SITE_URL. There is nowhere to send an
  // invite, and that must not read as the provisioning having failed.
  test("returns null when there is no origin at all", () => {
    expect(inviteOrigin(null, undefined)).toBeNull();
  });

  test("treats blank values as absent", () => {
    expect(inviteOrigin("  ", "   ")).toBeNull();
    expect(inviteOrigin("", "https://chattersnow.org")).toBe(
      "https://chattersnow.org",
    );
  });

  test("trims a trailing slash off the site URL so the path is not doubled", () => {
    expect(inviteOrigin(null, "https://chattersnow.org/")).toBe(
      "https://chattersnow.org",
    );
  });
});
