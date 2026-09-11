// #902: a section the platform has not sold this organization leaves the public
// site, whatever the board's own visibility switch says.
//
// The unit suite proves the registry resolves that way and the integration
// suite proves the RPCs refuse. What neither can show is the thing a visitor
// actually meets: the link gone from the nav *and* the URL returning 404. A
// link the nav no longer renders is still a live page, which is the failure
// this file exists to catch.
import { test, expect } from "./helpers/test";
import { createAdminClient } from "./helpers/admin-client";

// Inventory: two slots (`gears` and the single-route `gears-sizing`), both
// visible in the local seed, and nothing else in the suite depends on the gear
// library being reachable.
const MODULE = "inventory";

async function setModule(enabled: boolean) {
  const admin = createAdminClient();
  const { data: tenants, error: tenantError } = await admin
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1);
  if (tenantError)
    throw new Error(`Could not read tenants: ${tenantError.message}`);
  const tenantId = tenants?.[0]?.id;
  if (!tenantId) throw new Error("No tenant to set a module on");

  const { error } = await admin
    .from("tenant_modules")
    .upsert(
      { tenant_id: tenantId, module_key: MODULE, enabled },
      { onConflict: "tenant_id,module_key" },
    );
  if (error) throw new Error(`Could not set ${MODULE}: ${error.message}`);
}

async function setVisibility(slot: string, visible: boolean) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("app_settings")
    .upsert(
      { key: `page_visibility.${slot}`, value: visible },
      { onConflict: "tenant_id,key" },
    );
  if (error) throw new Error(`Could not set ${slot}: ${error.message}`);
}

test.describe("module gating on the public site", () => {
  // One row shared by the whole site, so this file mutates global state and
  // runs alone and last -- the same arrangement page-visibility.spec.ts has,
  // and for the same reason. Serial mode keeps its own cases from racing each
  // other's cleanup.
  test.describe.configure({ mode: "serial" });

  test.afterEach(async () => {
    await setModule(true);
    await setVisibility("gears", true);
  });

  test("the section is reachable and listed while the module is on", async ({
    page,
  }) => {
    await setModule(true);
    await page.goto("/gears");

    expect(page.url()).toContain("/gears");
    await expect(
      page.getByRole("navigation").getByText("Gear", { exact: true }).first(),
    ).toBeVisible();
  });

  test("turning the module off 404s the section and drops it from the nav", async ({
    page,
  }) => {
    await setModule(false);

    for (const path of ["/gears", "/gears/library", "/gears/donate"]) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} should be gone`).toBe(404);
    }

    // The nav is filtered from the same read, so a page that still renders --
    // the home page -- must not offer the link either.
    await page.goto("/home");
    await expect(
      page.getByRole("navigation").getByText("Gear", { exact: true }),
    ).toHaveCount(0);
  });

  test("the module overrides the board's own switch, not the other way round", async ({
    page,
  }) => {
    // The entitlement is the platform's and the switch is the organization's.
    // An admin who turns Gear on while the module is off must still get 404 --
    // otherwise the gate is advice.
    await setModule(false);
    await setVisibility("gears", true);

    const response = await page.goto("/gears");
    expect(response?.status()).toBe(404);
  });

  test("turning it back on restores whatever the board had set", async ({
    page,
  }) => {
    // Off is hidden and frozen, never deleted (#900), and that has to be true
    // of the switch as well as the data: re-enabling must not reset the
    // board's own choice to a default.
    await setVisibility("gears", false);
    await setModule(false);
    expect((await page.goto("/gears"))?.status()).toBe(404);

    await setModule(true);
    // Still 404, because the board had hidden it -- the module coming back
    // returns the decision to them rather than making it for them.
    expect((await page.goto("/gears"))?.status()).toBe(404);

    await setVisibility("gears", true);
    expect((await page.goto("/gears"))?.status()).toBe(200);
  });
});
