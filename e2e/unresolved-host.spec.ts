// Issue #795 Phase 4: the public site belongs to a host rather than to a
// session, so a host no tenant claims has nothing to serve and must 404.
//
// Before this, such a request rendered the platform defaults -- which meant a
// domain pointed at the deployment before its tenant row existed spent that
// window publicly serving another organization's name and copy. That is not
// hypothetical: demo.rickiecruz.com did exactly that, titled "Chatter Snow",
// between going up on Vercel and the demo tenant carrying it as a
// custom_domain.
//
// The guard cannot be exercised without a second *active* tenant, because
// `public_tenant_id()` falls back to the sole active tenant while there is
// exactly one -- which is the state seed.sql leaves and which every other spec
// depends on. So this file provisions one, and must give it back.
import { test, expect } from "./helpers/test";
import { createAdminClient } from "./helpers/admin-client";

const SLUG = "e2e-unresolved-host";

async function findTenantId(): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", SLUG)
    .maybeSingle();
  if (error) throw new Error(`Could not look up ${SLUG}: ${error.message}`);
  return (data?.id as string | undefined) ?? null;
}

/** A second active tenant, which is what switches the fallback off. */
async function provisionSecondTenant(): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("provision_tenant", {
    p_name: "E2E Unresolved Host",
    p_slug: SLUG,
    p_custom_domain: null,
    // No admin email: staging a pending_role_grants row for an address that
    // will never sign in is pointless here, and leaves a row behind if the
    // teardown ever misses.
    p_admin_email: null,
    p_plan: "white_label",
    p_template_tenant_id: null,
  });
  if (error) throw new Error(`Could not provision ${SLUG}: ${error.message}`);
}

/**
 * Idempotent on purpose: it runs both at the end of the narrative below and
 * again in afterAll, so a failure part-way through still gives the stack back.
 * A leftover *active* tenant here would break every later spec in the run --
 * and the developer's next local run too, until `bun run tenant:delete
 * e2e-unresolved-host --confirm e2e-unresolved-host`.
 */
async function removeSecondTenant(): Promise<void> {
  const id = await findTenantId();
  if (!id) return;
  const admin = createAdminClient();
  const { error: archiveError } = await admin
    .from("tenants")
    .update({ status: "archived" })
    .eq("id", id);
  if (archiveError) {
    throw new Error(`Could not archive ${SLUG}: ${archiveError.message}`);
  }
  // delete_tenant() refuses anything that is not archived, hence the order.
  const { error } = await admin.rpc("delete_tenant", { p_tenant_id: id });
  if (error) throw new Error(`Could not delete ${SLUG}: ${error.message}`);
}

test.describe("a host that resolves to no tenant", () => {
  // One shared database, and the cases below deliberately hand state to each
  // other: the fallback is on, then off, then on again. Serial within the file;
  // not racing the rest of the suite is playwright.config.ts's job, which puts
  // this file in the mutating project that runs last and alone (#594, #795).
  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    await removeSecondTenant();
  });

  // The control. Without it, a 404 below could equally mean the site is simply
  // broken, and the assertion would pass for the wrong reason.
  test("the public site serves while exactly one tenant is active", async ({
    page,
  }) => {
    const response = await page.goto("/home");
    expect(response?.status()).toBe(200);
  });

  test("every public route 404s once nothing resolves", async ({ page }) => {
    await provisionSecondTenant();

    for (const path of ["/home", "/events", "/inventory"]) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} should 404`).toBe(404);
    }

    // And names no organization while doing it: titling another organization's
    // domain after this one is the leak the 404 exists to close.
    //
    // The assertion is that property, not any particular wording, because what
    // supplies the title here is not obvious. `notFound()` thrown from a layout
    // looks for a not-found boundary *above* it, and there is none above
    // `(public)` -- so Next renders its own built-in 404, outside the public
    // layout, titled "404: This page could not be found.". Unbranded, which is
    // right for a host that belongs to nobody. The neutral titles in
    // `(public)/layout.tsx` and `publicTitle()` still matter: they are what
    // shows wherever that boundary resolves differently, as it does under the
    // dev server.
    await expect(page).not.toHaveTitle(/chatter/i);
    // Never blank either -- axe's document-title rule applies to a 404 too.
    expect((await page.title()).trim()).not.toBe("");
  });

  test("the portal is not affected by the host", async ({ page }) => {
    // Still running with the second tenant active. current_tenant_id() is
    // membership-based and never consults the host, which is what lets
    // portal.<anything> work before its domain is configured.
    const response = await page.goto("/portal/login");
    expect(response?.status()).toBe(200);
  });

  test("the site returns once the second tenant is gone", async ({ page }) => {
    await removeSecondTenant();
    const response = await page.goto("/home");
    expect(response?.status()).toBe(200);
  });
});
