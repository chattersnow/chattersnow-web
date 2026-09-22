// Issue #1083: the portal installs as a PWA, and the thing it installs as is
// the *tenant*, never the platform. The rule itself -- which name, colour and
// icon a manifest carries -- is unit-tested over `appManifest`; what this
// file covers is the wiring that a unit test cannot see: that the route is
// served at all, that it is resolved per request rather than cached, that the
// icon really comes back as a PNG, and that the service worker stays out of
// the browser suites.
import { test, expect } from "./helpers/test";

test.describe("the installed portal", () => {
  test("serves a manifest naming the host's own organization", async ({
    page,
  }) => {
    const response = await page.request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);

    expect(response.headers()["content-type"]).toContain(
      "application/manifest+json",
    );

    const manifest = await response.json();
    // seed.sql leaves exactly one tenant, `example-nonprofit`, and the
    // sole-active-tenant fallback resolves this host to it.
    // `<Name> Ops` since #1171: two apps on one home screen have to be told
    // apart, and "Ops" is a role word rather than a product name.
    expect(manifest.name).toBe("Example Nonprofit Ops");
    expect(manifest.display).toBe("standalone");
    // The marketing site is not what anyone installs.
    expect(manifest.start_url).toBe("/portal/home");
    expect(manifest.scope).toBe("/portal");
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("offers a 192 and a 512 icon, each any and maskable", async ({
    page,
  }) => {
    const manifest = await (
      await page.request.get("/manifest.webmanifest")
    ).json();
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(
      manifest.icons.map((icon: { purpose: string }) => icon.purpose),
    ).toContain("maskable");
  });

  test("renders a real icon for a tenant that has uploaded none", async ({
    page,
  }) => {
    // The seeded tenant has no `brand.app_icon_url`, which is the state every
    // tenant starts in: the route draws its initials on its brand colour
    // rather than falling back to a mark naming another organization.
    const response = await page.request.get("/api/app-icon/512");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    const body = await response.body();
    // A PNG signature, and enough of a file to be an actual raster.
    expect(body.subarray(0, 4).toString("binary")).toBe("\x89PNG");
    expect(body.byteLength).toBeGreaterThan(1000);
  });

  test("refuses a size nothing asks for", async ({ page }) => {
    const response = await page.request.get("/api/app-icon/64");
    expect(response.status()).toBe(404);
  });

  test("links the manifest and an apple-touch-icon from the portal", async ({
    page,
  }) => {
    await page.goto("/portal/login");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
    // iOS ignores the manifest's icons when adding to the home screen, so
    // without this an install is a screenshot of the page.
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      "href",
      "/api/app-icon/180",
    );
  });

  test("registers no service worker under automation", async ({ page }) => {
    // Both browser suites run against a production build, so the guard in
    // `shouldRegisterServiceWorker` is the only thing keeping a worker from
    // installing during one spec and serving cached chunks to every later one.
    //
    // The observation goes in before the navigation, rather than a
    // `getRegistrations()` read on the line after it. `ServiceWorkerRegistrar`
    // registers from an effect, so a read taken the moment `goto` resolves asks
    // the question before the code under test has had the chance to answer it,
    // and a regression in the guard would still come back zero. A hook
    // installed first is not a sample: it stands for the whole life of the
    // page, and "register was never called" is not something a later frame can
    // take back.
    await page.addInitScript(() => {
      const probe = window as unknown as { __swRegisterCalls: number };
      probe.__swRegisterCalls = 0;
      const container = navigator.serviceWorker;
      if (!container) return;
      const register = container.register.bind(container);
      container.register = ((...args: Parameters<typeof register>) => {
        probe.__swRegisterCalls += 1;
        return register(...args);
      }) as typeof container.register;
    });

    await page.goto("/portal/login");
    // The portal shell rendered, so the registrar it mounts is in the tree --
    // without this the absence below is equally true of a page that never
    // arrived. `link[rel="manifest"]` is head markup, so it is asserted by
    // attribute rather than by visibility.
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
    // Effects run after hydration, so give the bundle the same chance to
    // register that a reader's browser would have before reading the hook.
    await page.waitForLoadState("load");

    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __swRegisterCalls: number })
            .__swRegisterCalls,
      ),
      "the registrar called navigator.serviceWorker.register under automation",
    ).toBe(0);

    // And nothing an earlier spec installed is live against this origin.
    const registrations = await page.evaluate(async () =>
      navigator.serviceWorker
        ? (await navigator.serviceWorker.getRegistrations()).length
        : 0,
    );
    expect(registrations).toBe(0);
  });
});
