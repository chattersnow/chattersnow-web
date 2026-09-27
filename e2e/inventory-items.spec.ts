import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { modal } from "./helpers/dialog";

/**
 * The inventory item page (#1441). Each test gets its own throwaway item with
 * no tag code, since generating one and editing the item both change it, and
 * the PR suite runs two Playwright projects against one database.
 */
async function seedUntaggedItem() {
  const admin = createAdminClient();
  // inventory_items.created_by is `not null references auth.users`, and the
  // service-role client has no auth.uid(), so borrow a seeded donation's.
  const { data: donation, error: donationError } = await admin
    .from("donations")
    .select("id, created_by")
    .limit(1)
    .single();
  if (donationError) throw donationError;

  const description = `E2E item page ${crypto.randomUUID().slice(0, 8)}`;
  const { data: item, error } = await admin
    .from("inventory_items")
    .insert({
      donation_id: donation.id,
      created_by: donation.created_by,
      description,
      type: "jacket",
      condition: "good",
      status: "available",
    })
    .select("id")
    .single();
  if (error) throw error;

  return {
    id: item.id as string,
    description,
    async cleanup() {
      await admin.from("inventory_item_tags").delete().eq("item_id", item.id);
      await admin.from("inventory_items").delete().eq("id", item.id);
    },
  };
}

test.describe("portal inventory item page", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("the list links to the page, and the old ?item= URL redirects", async ({
    page,
  }) => {
    const item = await seedUntaggedItem();
    try {
      await page.goto(`/portal/inventory/items?item=${item.id}`);
      await expect(page).toHaveURL(
        new RegExp(`/portal/inventory/items/${item.id}$`),
      );
      await expect(
        page.getByRole("heading", { level: 1, name: item.description }),
      ).toBeVisible();

      const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
      await expect(breadcrumb).toContainText(item.description);
      await breadcrumb
        .getByRole("link", { name: "Items", exact: true })
        .click();
      await expect(page).toHaveURL(/\/portal\/inventory\/items(\?.*)?$/);

      await page.goto(
        `/portal/inventory/items?search=${encodeURIComponent(item.description)}`,
      );
      await page.getByRole("link", { name: "View item" }).first().click();
      await expect(page).toHaveURL(
        new RegExp(`/portal/inventory/items/${item.id}$`),
      );
    } finally {
      await item.cleanup();
    }
  });

  test("generates a code in place, copies its URL, and the tag opens the page", async ({
    page,
    context,
    browserName,
  }) => {
    const item = await seedUntaggedItem();
    try {
      await page.goto(`/portal/inventory/items/${item.id}`);
      const tagCode = page.locator("#item-assetTag");
      await expect(tagCode).toHaveText("None yet");
      await expect(
        page.getByRole("button", { name: /Copy tag URL/ }),
      ).toHaveCount(0);

      const generate = page.getByRole("button", { name: "Generate code" });
      await generate.hover();
      await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText(
        "Generate code",
      );
      await generate.click();

      await expect(tagCode).toHaveText(/^[A-Z0-9]{4,16}$/);
      const code = (await tagCode.textContent())!.trim();
      await expect(generate).toHaveCount(0);

      const copy = page.getByRole("button", {
        name: `Copy tag URL for ${code}`,
      });
      await expect(copy).toBeVisible();
      await expect(
        page.getByRole("link", { name: `Print label for ${code}` }),
      ).toHaveAttribute(
        "href",
        `/portal/inventory/items/labels?items=${item.id}&code=tag`,
      );

      // Only Chromium lets a test read the clipboard back.
      if (browserName === "chromium") {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        await copy.click();
        await expect(
          page.getByRole("button", { name: "Copied" }),
        ).toBeVisible();
        const copied = await page.evaluate(() =>
          navigator.clipboard.readText(),
        );
        expect(copied).toBe(`${new URL(page.url()).origin}/portal/t/${code}`);
      }

      await page.goto(`/portal/t/${code}`);
      await expect(page).toHaveURL(
        new RegExp(`/portal/inventory/items/${item.id}$`),
      );
    } finally {
      await item.cleanup();
    }
  });

  test("edits the item from a sheet opened on the toolbar", async ({
    page,
  }) => {
    const item = await seedUntaggedItem();
    try {
      await page.goto(`/portal/inventory/items/${item.id}`);
      await page.getByRole("button", { name: "Edit item" }).click();
      const sheet = modal(page);
      await expect(
        sheet.getByRole("heading", { name: "Edit item" }),
      ).toBeVisible();

      const notes = `E2E notes ${Date.now()}`;
      await sheet.getByLabel("Item notes").fill(notes);
      await sheet.getByRole("button", { name: "Save changes" }).click();

      await expect(sheet).not.toBeVisible();
      await expect(page.locator("#item-notes")).toHaveText(notes);
    } finally {
      await item.cleanup();
    }
  });
});
