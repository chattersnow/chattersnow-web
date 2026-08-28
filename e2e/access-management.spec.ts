import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";

// Pre-creates the person directly (rather than exercising PersonPicker's
// inline "+ Create new person" flow, which isn't otherwise covered by any
// e2e spec) so this test stays focused on the Access Management feature
// itself and its own search-and-select path, not PersonPicker internals.
async function seedPerson(admin: ReturnType<typeof createAdminClient>) {
  const name = `E2E Person ${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await admin
    .from("people")
    .insert({ name, source_type: "individual" })
    .select("id")
    .single();
  if (error) throw error;
  const id = data.id as string;
  return {
    id,
    name,
    async cleanup() {
      await admin.from("access_grants").delete().eq("person_id", id);
      await admin.from("people").delete().eq("id", id);
    },
  };
}

// A diagnostic run against CI proved the app's own data path is correct
// (the mutation lands, and the page URL is right before the reload) -- a
// plain `page.reload()` on this long, multi-step test occasionally comes
// back on /portal/login instead, evidently a transient session hiccup from
// two Playwright projects running the full suite concurrently against one
// shared local Supabase instance, both signed in as the same seeded admin
// account. Recover by signing back in and returning to the same URL rather
// than let that transient hiccup fail an otherwise-passing assertion.
async function reloadStayingSignedIn(page: Page) {
  const url = page.url();
  await page.reload();
  if (page.url().includes("/portal/login")) {
    await signIn(page);
    await page.goto(url);
  }
}

test.describe("portal access management", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("loads the Access Management page", async ({ page }) => {
    await page.goto("/portal/administration/access-management");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Access Management",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("creates an asset with a new service, adds an access grant, and records a review", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const person = await seedPerson(admin);

    try {
      await page.goto("/portal/administration/access-management");

      const assetName = `E2E Asset ${Date.now()}`;
      const serviceName = `E2E Service ${Date.now()}`;

      await page.getByRole("button", { name: "New asset" }).click();
      const createDialog = page.getByRole("dialog");
      await expect(
        createDialog.getByRole("heading", { name: "Add asset" }),
      ).toBeVisible();

      await createDialog.getByLabel("Name").fill(assetName);
      await createDialog.getByRole("button", { name: "+ New service" }).click();
      await createDialog.getByLabel("Service name").fill(serviceName);
      await createDialog
        .getByRole("button", { name: "Create & select" })
        .click();
      await expect(createDialog.getByText(serviceName)).toBeVisible();

      await createDialog.getByRole("button", { name: "Add asset" }).click();
      await expect(createDialog).not.toBeVisible();

      const row = page.getByRole("row").filter({ hasText: assetName });
      await expect(row).toBeVisible({ timeout: 15_000 });

      await row.getByRole("link", { name: assetName }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: assetName, exact: true }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Add access grant" }).click();
      const grantDialog = page.getByRole("dialog");
      await grantDialog
        .getByPlaceholder("Search by name or email...")
        .fill(person.name);
      await grantDialog.getByRole("button", { name: person.name }).click();
      await expect(grantDialog.getByText(person.name)).toBeVisible();

      await grantDialog
        .getByRole("button", { name: "Add access grant" })
        .click();
      await expect(grantDialog).not.toBeVisible();

      await reloadStayingSignedIn(page);
      const grantRow = page.getByRole("row").filter({ hasText: person.name });
      await expect(grantRow).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Record review" }).click();
      const reviewDialog = page.getByRole("alertdialog");
      await reviewDialog.getByRole("button", { name: "Record review" }).click();
      await expect(reviewDialog).not.toBeVisible();
      await reloadStayingSignedIn(page);
      await expect(
        page.getByText(new Date().toISOString().slice(0, 10)),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await person.cleanup();
    }
  });
});
