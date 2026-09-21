// Issue #1171: the public site is an installable app of its own, separate from
// the portal's. The rule itself -- which name, scope and colour each surface's
// manifest carries -- is unit-tested over `appManifest`; what this file covers
// is the wiring a unit test cannot see: that the second route is served, that
// each tree links its own manifest and only its own, and that the trees
// outside both link none.
//
// This suite runs against one origin, which is the shared-origin shape (the
// demo tenant, a preview, a local run): the portal is a path under `/portal`,
// so the public app narrows to `/my` and the two scopes stay disjoint.
import { test, expect } from "./helpers/test";

test.describe("the installed public site", () => {
  test("serves a manifest naming the host's own organization", async ({
    page,
  }) => {
    const response = await page.request.get("/site.webmanifest");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain(
      "application/manifest+json",
    );

    const manifest = await response.json();
    // seed.sql leaves exactly one tenant, `example-nonprofit`, and the
    // sole-active-tenant fallback resolves this host to it. The supporter app
    // carries the plain name -- it is the one most people install.
    expect(manifest.name).toBe("Example Nonprofit");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("claims a scope the portal's install cannot overlap", async ({
    page,
  }) => {
    const [supporter, portal] = await Promise.all([
      (await page.request.get("/site.webmanifest")).json(),
      (await page.request.get("/manifest.webmanifest")).json(),
    ]);

    expect(supporter.start_url).toBe("/my");
    expect(supporter.scope).toBe("/my");
    expect(portal.scope).toBe("/portal");
    // `id` is `scope`, so one origin here really is two apps.
    expect(supporter.id).not.toBe(portal.id);
    // And two distinguishable home-screen names.
    expect(supporter.short_name).not.toBe(portal.short_name);
  });

  test("links its own manifest, and an apple-touch-icon, from a public page", async ({
    page,
  }) => {
    await page.goto("/home");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/site.webmanifest",
    );
    // iOS ignores the manifest's icons when adding to the home screen, so
    // without this an install is a screenshot of the page.
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      "href",
      "/api/app-icon/180",
    );
  });

  test("an Add to Home Screen from the public site is never the portal", async ({
    page,
  }) => {
    // The bug this ticket exists for: a root metadata route put the portal's
    // manifest on every page of every host, so a supporter who installed from
    // the website got an app that launched at /portal/home -- the no-access
    // screen for everyone who is not staff.
    await page.goto("/my/sign-in");
    const hrefs = await page
      .locator('link[rel="manifest"]')
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute("href") ?? ""),
      );
    expect(hrefs).toEqual(["/site.webmanifest"]);
  });

  test("a tree that is neither surface advertises no install", async ({
    page,
  }) => {
    // `/links` has a layout of its own, deliberately outside `(public)`, and
    // is not part of either app.
    await page.goto("/links");
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
  });
});
