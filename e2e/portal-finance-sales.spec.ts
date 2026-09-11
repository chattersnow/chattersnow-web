// Issue #908: E2E coverage for the point-of-sale register and the sales ledger.
//
// One pass through the workflow the feature exists for: tap a product, record
// the sale, find it in the ledger, open it and see the line. What this catches
// that the unit and integration suites cannot is the chain itself -- a Server
// Action reachable from a client component, the revalidation that makes the new
// row visible on another route, and the sheet rendering a row the RPC wrote.
//
// Run locally with:
//   E2E_BROWSERS=chromium bunx playwright test e2e/portal-finance-sales.spec.ts
import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { modal } from "./helpers/dialog";

// The seeded beanie (supabase/seed.sql): one variant, plenty of stock.
const TILE = "Add Chatter Snow Beanie — One size, $20.00";
const VARIANT_ID = "cdcdcdcd-0000-4000-8000-000000001001";
const SEEDED_STOCK = 38;

/** Marks every sale this file records, so the cleanup can find them. */
const NOTES_PREFIX = "E2E sale";

test.describe("portal sales register and ledger", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  // A recorded sale moves real stock, and the register, the Products admin and
  // the a11y scan all read that figure -- so the sale goes, and the stock goes
  // back to what the seed says it is.
  test.afterEach(async () => {
    const admin = createAdminClient();
    await admin.from("sales").delete().like("notes", `${NOTES_PREFIX}%`);
    await admin
      .from("product_variants")
      .update({ stock_on_hand: SEEDED_STOCK })
      .eq("id", VARIANT_ID);
  });

  test("records a sale at the register and finds it in the ledger", async ({
    page,
  }) => {
    const note = `${NOTES_PREFIX} ${Date.now()}`;

    await page.goto("/portal/finance/sales/register");
    await expect(
      page.getByRole("heading", { level: 1, name: "Register", exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: TILE }).click();
    await expect(
      page.getByLabel("Quantity of Chatter Snow Beanie — One size"),
    ).toHaveText("1");

    await page.getByLabel("Notes").fill(note);
    await page.getByRole("button", { name: /^Record sale/ }).click();

    // The toast names the figure, which is the confirmation a cashier reads
    // before handing anything over.
    await expect(page.getByText("Sale recorded — $20.00")).toBeVisible();
    await expect(
      page.getByText("Tap a product to start a sale."),
    ).toBeVisible();

    await page.goto("/portal/finance/sales");
    await expect(
      page.getByRole("heading", { level: 1, name: "Sales", exact: true }),
    ).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: "$20.00" }).first();
    await expect(row).toContainText("Completed");

    await row.getByRole("button", { name: /^View sale of/ }).click();
    const sheet = modal(page);
    await expect(
      sheet.getByText("Chatter Snow Beanie — One size"),
    ).toBeVisible();
  });

  test("the register refuses to oversell and says what is left", async ({
    page,
  }) => {
    const admin = createAdminClient();
    await admin
      .from("product_variants")
      .update({ stock_on_hand: 1 })
      .eq("id", VARIANT_ID);

    await page.goto("/portal/finance/sales/register");

    const tile = page.getByRole("button", { name: TILE });
    await tile.click();
    // One of one: the tile and the stepper both close off rather than building
    // a cart that cannot be recorded.
    await expect(tile).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: "One more Chatter Snow Beanie — One size",
      }),
    ).toBeDisabled();
    await expect(tile).toContainText("Sold out");
  });
});
