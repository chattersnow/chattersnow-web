import { test, expect } from "./helpers/test";
import { clickNavLink } from "./helpers/nav";
import { createAdminClient } from "./helpers/admin-client";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Puts `count` available items into the public catalog, tagged with a random
 * suffix the catalog's search box can filter down to.
 *
 * Requesting gear flips an item to `reserved` (request_gear_items), which
 * drops it out of public_gear_catalog permanently -- and the PR suite runs
 * two Playwright projects concurrently against one Supabase instance (the
 * nightly runs four), so a test that consumed a seeded item would race the
 * other projects for it. Each run gets its own throwaway items instead.
 */
async function seedAvailableGearItems(admin: AdminClient, count: number) {
  // inventory_items.created_by is `not null references auth.users` and the
  // service-role client has no auth.uid(), so borrow a donation and its
  // creator from a seeded row rather than standing up a donor, a donation,
  // and a user just to hang throwaway items off.
  const { data: donation, error: donationError } = await admin
    .from("donations")
    .select("id, created_by")
    .limit(1)
    .single();
  if (donationError) throw donationError;

  const suffix = crypto.randomUUID().slice(0, 8);
  const descriptions = Array.from(
    { length: count },
    (_, index) => `E2E gear ${suffix} item ${index + 1}`,
  );

  const { data: items, error: itemsError } = await admin
    .from("inventory_items")
    .insert(
      descriptions.map((description) => ({
        donation_id: donation.id,
        created_by: donation.created_by,
        description,
        // The before-insert trigger resolves this free text to the "Jacket"
        // category, the same path sync_event_sponsor_donations takes.
        type: "jacket",
        condition: "good",
        status: "available",
      })),
    )
    .select("id");
  if (itemsError) throw itemsError;

  const itemIds = (items ?? []).map((item) => item.id as string);

  return {
    suffix,
    descriptions,
    async cleanup() {
      await admin
        .from("inventory_movements")
        .delete()
        .in("inventory_item_id", itemIds);
      await admin.from("inventory_items").delete().in("id", itemIds);
    },
  };
}

// The labels below are the platform's own words, not Chatter Snow's (#896).
// The section is named from the tenant's lexicon now, and the seeded local
// tenant -- "Example Nonprofit" -- sets none, so it reads "Items" / "Library"
// where a tenant that has said it lends gear reads "Gear" / "Gear Library".
// That is the point of the ticket, and exercising the unset path here is worth
// more than restating one organization's vocabulary.
test.describe("public inventory pages", () => {
  test("the section index redirects to the library", async ({ page }) => {
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/inventory\/library$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeVisible();
  });

  // The section was at /gears until #897. Links to it are in the wild -- other
  // sites, search results, bookmarks -- so the old paths stay answered, and
  // they are answered here rather than in a unit test because the redirect
  // lives in next.config.ts and only exists in a built, running app.
  test("the old /gears paths redirect to the new segment", async ({ page }) => {
    const moved = [
      ["/gears", "/inventory/library"],
      ["/gears/library", "/inventory/library"],
      ["/gears/donate", "/inventory/donate"],
    ];

    for (const [from, to] of moved) {
      const response = await page.goto(from);
      expect(response?.status(), from).toBe(200);
      expect(new URL(page.url()).pathname, from).toBe(to);
    }
  });

  test("nav resolves to the library", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Library", { group: "Items" });

    await expect(page).toHaveURL(/\/inventory\/library$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Library" }),
    ).toBeVisible();
  });

  test("nav resolves to Sizing Guide", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Sizing Guide", { group: "Items" });

    await expect(page).toHaveURL(/\/inventory\/sizing$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sizing guide" }),
    ).toBeVisible();
  });

  test("nav resolves to the donation page", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Donate or Request Items", { group: "Items" });

    await expect(page).toHaveURL(/\/inventory\/donate/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "How the library works",
      }),
    ).toBeVisible();
  });

  test("library and donate copy don't imply formal membership", async ({
    page,
  }) => {
    await page.goto("/inventory/library");
    await expect(
      page.getByText("Browse items currently available to the community."),
    ).toBeVisible();
    await expect(page.getByText(/\bmembers\b/i)).toHaveCount(0);

    await page.goto("/inventory/donate");
    await expect(page.getByText(/community members/i)).toHaveCount(0);
    await expect(page.getByText(/where members can/i)).toHaveCount(0);
  });

  test("adding gear to the cart and submitting a request", async ({ page }) => {
    const admin = createAdminClient();
    const gear = await seedAvailableGearItems(admin, 2);
    const requesterEmail = `e2e-gear-${gear.suffix}@example.test`;

    try {
      await page.goto("/inventory/library");

      // Narrow the catalog to this run's own items so the checkbox counts
      // below are exact no matter what else is in the seeded catalog.
      await page.getByLabel("Search").fill(gear.suffix);

      const addToCart = page.getByRole("checkbox", { name: "Add to cart" });
      await expect(addToCart).toHaveCount(2);
      await addToCart.first().click();
      await expect(addToCart).toHaveCount(1);
      await addToCart.first().click();
      await expect(addToCart).toHaveCount(0);

      await page.getByRole("button", { name: "View cart" }).click();

      const cart = page.getByRole("dialog", { name: "Your cart" });
      await expect(cart.getByText(gear.descriptions[0])).toBeVisible();
      await expect(cart.getByText(gear.descriptions[1])).toBeVisible();

      await cart.getByLabel("Name", { exact: true }).fill("E2E Gear Requester");
      await cart.getByLabel("Email").fill(requesterEmail);
      await cart.getByRole("button", { name: "Request 2 items" }).click();

      await expect(cart.getByText("Request received!")).toBeVisible();
    } finally {
      await gear.cleanup();
      await admin.from("people").delete().eq("email", requesterEmail);
    }
  });
});
