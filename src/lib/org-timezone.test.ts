import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ORG_TIME_ZONE,
  ORG_TIMEZONE_SETTING_KEY,
  isOrgTimeZone,
} from "./org-timezone";
import { TIMEZONE_OPTIONS } from "./time";

describe("isOrgTimeZone", () => {
  for (const option of TIMEZONE_OPTIONS) {
    test(`accepts ${option.value}`, () => {
      expect(isOrgTimeZone(option.value)).toBe(true);
    });
  }

  test("rejects a zone the portal does not offer", () => {
    // Postgres knows it; the settings form cannot produce it, so neither can
    // a correction to it.
    expect(isOrgTimeZone("Europe/Paris")).toBe(false);
  });

  test("rejects a UTC offset, an empty string and a non-string", () => {
    expect(isOrgTimeZone("UTC-7")).toBe(false);
    expect(isOrgTimeZone("")).toBe(false);
    expect(isOrgTimeZone(null)).toBe(false);
    expect(isOrgTimeZone(undefined)).toBe(false);
    expect(isOrgTimeZone(7)).toBe(false);
  });
});

describe("the setting itself", () => {
  test("lives under the org.* prefix, which provisioning copies", () => {
    // provision_tenant() copies finance.%, content.% and org.% into a new
    // tenant (20260906110000); a key outside those prefixes would leave every
    // new organization with no zone at all.
    expect(ORG_TIMEZONE_SETTING_KEY.startsWith("org.")).toBe(true);
  });

  test("falls back to the boundary every report used before #1065", () => {
    expect(DEFAULT_ORG_TIME_ZONE).toBe("UTC");
  });
});
