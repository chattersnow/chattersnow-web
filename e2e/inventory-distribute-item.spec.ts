import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { modal } from "./helpers/dialog";
import { pickPerson, seedPerson } from "./helpers/people";
import { seedUserWithRole, type SeededUser } from "./helpers/rbac";

/**
 * Distribute from an item's page (#1443): pick the recipient there, then add
 * two more pieces by opening their tags in new tabs -- what an iPhone NFC tap
 * does -- and record all three for that recipient.
 *
 * A distribution list is its owner's, and the resolver offers whichever list
 * that person touched last, so the test signs in as a throwaway account: the
 * PR suite runs two Playwright projects against one database, and a shared
 * seeded admin would have each project's tabs adding to the other's list.
 */

const admin = createAdminClient();

async function seedTaggedItems(count: number) {
  // inventory_items.created_by is `not null references auth.users`, and the
  // service-role client has no auth.uid(), so borrow a seeded donation's.
  const { data: donation, error: donationError } = await admin
    .from("donations")
    .select("id, created_by")
    .limit(1)
    .single();
  if (donationError) throw donationError;

  const suffix = crypto.randomUUID().slice(0, 8);
  const { data: items, error } = await admin
    .from("inventory_items")
    .insert(
      Array.from({ length: count }, (_, i) => ({
        donation_id: donation.id,
        created_by: donation.created_by,
        description: `E2E distribute ${suffix} #${i + 1}`,
        type: "jacket",
        condition: "good",
        status: "available",
        intended_use: "gear_library",
      })),
    )
    .select("id, description");
  if (error) throw error;

  // An asset tag inserted without a value is given a fresh code.
  const { data: tags, error: tagError } = await admin
    .from("inventory_item_tags")
    .insert(items.map((item) => ({ item_id: item.id, kind: "asset_tag" })))
    .select("item_id, value");
  if (tagError) throw tagError;

  return items
    .map((item) => ({
      id: item.id as string,
      description: item.description as string,
      code: tags.find((tag) => tag.item_id === item.id)!.value as string,
    }))
    .sort((a, b) => a.description.localeCompare(b.description));
}

test.describe("distribute an item from its page", () => {
  let user: SeededUser;
  let items: Awaited<ReturnType<typeof seedTaggedItems>>;
  let recipient: { id: string; name: string };

  test.beforeEach(async () => {
    user = await seedUserWithRole(admin, "admin");
    items = await seedTaggedItems(3);
    recipient = await seedPerson(admin, "Distribute Recipient");
  });

  test.afterEach(async () => {
    const ids = items.map((item) => item.id);
    await admin
      .from("inventory_movements")
      .delete()
      .in("inventory_item_id", ids);
    await admin.from("inventory_item_tags").delete().in("item_id", ids);
    await admin.from("inventory_items").delete().in("id", ids);
    await admin.from("people").delete().eq("id", recipient.id);
    await admin
      .from("inventory_distribution_drafts")
      .delete()
      .eq("user_id", user.userId);
    await user.cleanup();
  });

  test("picks the recipient, adds two tags from new tabs, records all three", async ({
    page,
    context,
  }) => {
    await signIn(page, { email: user.email });
    await page.goto(`/portal/inventory/items/${items[0].id}`);

    await page.getByRole("button", { name: "Distribute", exact: true }).click();
    const dialog = modal(page);
    await expect(dialog.getByText(items[0].description)).toBeVisible();
    await pickPerson(dialog, recipient.name, {
      placeholder: "Search recipient by name or email...",
    });

    // Each tag opens in a tab that knows nothing of the first one's state.
    for (const item of items.slice(1)) {
      const tab = await context.newPage();
      await tab.goto(`/portal/t/${item.code}`);
      const add = tab.getByRole("button", {
        name: new RegExp(`^Add to .* for ${recipient.name}$`),
      });
      await expect(add).toBeVisible({ timeout: 15_000 });
      await add.click();
      await expect(tab.getByRole("status")).toContainText("Added to");
      await tab.close();
    }

    // Closing and reopening reads the list back from the server. The footer's
    // Close, not the corner X: that one is named "Close" too, and on a phone
    // (a sheet) it also carries the word as screen-reader text, so matching
    // on text alone finds both.
    await dialog
      .getByRole("button", { name: "Close", exact: true })
      .and(
        page.locator(
          ':not([data-slot="sheet-close"]):not([data-slot="dialog-close"])',
        ),
      )
      .click();
    await expect(dialog).not.toBeVisible();
    const reopen = page.getByRole("button", {
      name: `Open current distribution (3 items, for ${recipient.name})`,
    });
    await expect(reopen).toBeVisible({ timeout: 15_000 });
    await reopen.click();
    await dialog
      .getByRole("button", { name: "Record 3 items" })
      .click({ timeout: 15_000 });
    await expect(dialog).not.toBeVisible({ timeout: 15_000 });

    const { data: movements, error } = await admin
      .from("inventory_movements")
      .select("inventory_item_id, recipient_person_id")
      .eq("movement_type", "distributed")
      .in(
        "inventory_item_id",
        items.map((item) => item.id),
      );
    expect(error).toBeNull();
    expect(movements).toHaveLength(3);
    for (const movement of movements ?? []) {
      expect(movement.recipient_person_id).toBe(recipient.id);
    }
  });
});
