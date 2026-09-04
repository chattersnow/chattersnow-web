import { test, expect } from "@playwright/test";
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

test.describe("public gears pages", () => {
  test("gears index redirects to the gear library", async ({ page }) => {
    await page.goto("/gears");
    await expect(page).toHaveURL(/\/gears\/library$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Gear library" }),
    ).toBeVisible();
  });

  test("nav resolves to Gear Library", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Gear Library", { group: "Gear" });

    await expect(page).toHaveURL(/\/gears\/library$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Gear library" }),
    ).toBeVisible();
  });

  test("nav resolves to Sizing Guide", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Sizing Guide", { group: "Gear" });

    await expect(page).toHaveURL(/\/gears\/sizing$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sizing guide" }),
    ).toBeVisible();
  });

  test("nav resolves to the gear donation page", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Donate or Request Gear", { group: "Gear" });

    await expect(page).toHaveURL(/\/gears\/donate/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "How the gear program works",
      }),
    ).toBeVisible();
  });

  test("gear library and donate copy don't imply formal membership", async ({
    page,
  }) => {
    await page.goto("/gears/library");
    await expect(
      page.getByText("Browse gear currently available to the community."),
    ).toBeVisible();
    await expect(page.getByText(/Chatter Snow members/i)).toHaveCount(0);

    await page.goto("/gears/donate");
    await expect(page.getByText(/community members/i)).toHaveCount(0);
    await expect(page.getByText(/where members can/i)).toHaveCount(0);
  });

  test("adding gear to the cart and submitting a request", async ({ page }) => {
    const admin = createAdminClient();
    const gear = await seedAvailableGearItems(admin, 2);
    const requesterEmail = `e2e-gear-${gear.suffix}@example.test`;

    try {
      await page.goto("/gears/library");

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
