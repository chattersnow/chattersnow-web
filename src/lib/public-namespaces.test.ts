// The predicate behind #888's invariant. `test/public-namespaces.integration.test.ts`
// applies it to every row in the database; the cases here are what make that
// run mean something, since a predicate that never finds anything would pass
// the integration check against any schema at all.
import { describe, expect, test } from "bun:test";
import {
  RESERVED_NAMESPACES,
  SITE_CONTENT_KEYS,
  reservedNamespaceFor,
  unregisteredPublicKeys,
} from "./public-namespaces";

const settings = (...keys: string[]) =>
  keys.map((key) => ({ table: "app_settings" as const, key }));
const content = (...keys: string[]) =>
  keys.map((key) => ({ table: "site_content" as const, key }));

describe("RESERVED_NAMESPACES", () => {
  test("covers the five prefixes the public views match on", () => {
    expect(RESERVED_NAMESPACES.map((namespace) => namespace.prefix)).toEqual([
      "brand.",
      "page_visibility.",
      "layout.",
      "legal_publication.",
      "site_images.",
    ]);
  });

  test("every namespace knows at least one key", () => {
    for (const namespace of RESERVED_NAMESPACES) {
      expect(namespace.keys.length).toBeGreaterThan(0);
      for (const key of namespace.keys) {
        expect(key.startsWith(namespace.prefix)).toBe(true);
      }
    }
  });

  test("the image slots are a subset of the site_content registry", () => {
    const images = RESERVED_NAMESPACES.find(
      (namespace) => namespace.prefix === "site_images.",
    )!;
    for (const key of images.keys) {
      expect(SITE_CONTENT_KEYS).toContain(key);
    }
  });
});

describe("reservedNamespaceFor", () => {
  test("matches a reserved prefix in the table that serves it", () => {
    expect(
      reservedNamespaceFor({ table: "app_settings", key: "brand.primary" })
        ?.view,
    ).toBe("public_branding");
    expect(
      reservedNamespaceFor({ table: "site_content", key: "site_images.x" })
        ?.view,
    ).toBe("public_site_images");
  });

  test("leaves a private app_settings key alone", () => {
    expect(
      reservedNamespaceFor({
        table: "app_settings",
        key: "finance.fiscal_year_start_month",
      }),
    ).toBeUndefined();
    expect(
      reservedNamespaceFor({
        table: "app_settings",
        key: "notifications.enabled",
      }),
    ).toBeUndefined();
  });

  // site_images.* lived in app_settings until 20260908030000 moved the rows.
  test("does not report a leftover site_images row in app_settings", () => {
    expect(
      reservedNamespaceFor({
        table: "app_settings",
        key: "site_images.learn_photo",
      }),
    ).toBeUndefined();
  });
});

describe("unregisteredPublicKeys", () => {
  test("accepts the registered keys", () => {
    expect(
      unregisteredPublicKeys([
        ...settings(
          "brand.primary",
          "brand.accent_stops",
          "brand.logo_url",
          "page_visibility.programs",
          "layout.home_upcoming_count",
          "legal_publication.terms",
        ),
        ...content("org.short_name", "site_images.about_story_photo"),
      ]),
    ).toEqual([]);
  });

  test("ignores app_settings keys outside every reserved prefix", () => {
    expect(
      unregisteredPublicKeys(
        settings("finance.approval_threshold", "content.brief_lead_days"),
      ),
    ).toEqual([]);
  });

  // The two names #888 raises as the plausible next mistake.
  test("flags a new key under a reserved prefix", () => {
    const findings = unregisteredPublicKeys(
      settings("brand.internal_notes", "layout.admin_only_flag"),
    );

    expect(findings.map((finding) => finding.key)).toEqual([
      "brand.internal_notes",
      "layout.admin_only_flag",
    ]);
    expect(findings[0].detail).toContain("public_branding");
    expect(findings[0].detail).toContain("src/lib/branding.ts");
  });

  test("flags a site_content row no slot claims, whatever its prefix", () => {
    const findings = unregisteredPublicKeys(
      content("org.internal_note", "site_images.retired_photo"),
    );

    expect(findings.map((finding) => finding.key)).toEqual([
      "org.internal_note",
      "site_images.retired_photo",
    ]);
    expect(findings[0].detail).toContain("public_site_content");
  });
});
