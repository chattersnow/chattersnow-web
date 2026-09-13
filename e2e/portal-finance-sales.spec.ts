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

  // #1016. Deliberately not asserting on the print dialog: the receipt is a
  // page, and whether the browser opens its own print UI is the browser's
  // business. What this checks is that the page the cashier is sent to renders
  // the sale, from a receipt number the database assigned on the way in.
  test("a recorded sale has a printable receipt", async ({ page }) => {
    const note = `${NOTES_PREFIX} ${Date.now()}`;

    await page.goto("/portal/finance/sales/register");
    await page.getByRole("button", { name: TILE }).click();
    await page.getByLabel("Notes").fill(note);
    await page.getByRole("button", { name: /^Record sale/ }).click();

    // The line under the Record button, which is the half of this that is
    // still there after the toast has gone.
    const recorded = page.getByText(/^Recorded #\d{6} · \$20\.00$/);
    await expect(recorded).toBeVisible();
    const receiptNumber = (await recorded.innerText()).match(/#\d{6}/)![0];

    const link = page.getByRole("link", { name: "Receipt" });
    const href = await link.getAttribute("href");
    expect(href).toMatch(
      /^\/portal\/finance\/sales\/[0-9a-f-]+\/receipt\?print=1$/,
    );

    // Followed without `print=1`: the parameter's whole job is to call
    // window.print() on mount, and a print dialog is not something to hold a
    // browser open on. The sheet's own Receipt link goes to this same URL.
    await page.goto(href!.replace("?print=1", ""));

    await expect(
      page.getByRole("heading", { level: 1, name: `Receipt ${receiptNumber}` }),
    ).toBeVisible();
    await expect(
      page.getByText("Chatter Snow Beanie — One size"),
    ).toBeVisible();
    await expect(page.getByText("$20.00").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Print / Save as PDF" }),
    ).toBeVisible();
  });

  // Deliberately a second pass rather than an extension of the first: the test
  // above is the only end-to-end proof that an ordinary sale still sends no
  // money at all, and folding an override into it would spend that.
  test("rings up an overridden price and a custom item, and the ledger shows both", async ({
    page,
  }) => {
    const note = `${NOTES_PREFIX} ${Date.now()}`;

    await page.goto("/portal/finance/sales/register");
    await page.getByRole("button", { name: TILE }).click();

    // A damaged beanie at a quarter of the price.
    await page
      .getByRole("button", {
        name: "Change price of Chatter Snow Beanie — One size",
      })
      .click();
    // exact: Playwright matches an accessible name by substring, and several
    // controls in this row are named after the same line.
    const priceField = page.getByLabel(
      "Price of Chatter Snow Beanie — One size",
      { exact: true },
    );
    await priceField.fill("5");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("was $20.00")).toBeVisible();

    // And a thing that was never in the catalog.
    await page
      .getByRole("button", {
        name: "Add a custom item that is not in the catalog",
      })
      .click();
    const dialog = modal(page);
    await dialog.getByLabel("Description").fill("Donated print");
    await dialog.getByLabel("Price").fill("3.50");
    await dialog.getByRole("button", { name: "Add to cart" }).click();

    await expect(page.getByLabel("Quantity of Donated print")).toHaveText("1");

    await page.getByLabel("Notes").fill(note);
    await page.getByRole("button", { name: /^Record sale/ }).click();
    await expect(page.getByText("Sale recorded — $8.50")).toBeVisible();

    await page.goto("/portal/finance/sales");
    const row = page.getByRole("row").filter({ hasText: "$8.50" }).first();
    await row.getByRole("button", { name: /^View sale of/ }).click();

    const sheet = modal(page);
    // The catalog price it would have been, and the marker that one of these
    // lines has no product behind it.
    await expect(sheet.getByLabel("Was $20.00")).toBeVisible();
    await expect(sheet.getByText("Custom")).toBeVisible();
    await expect(sheet.getByText("Donated print")).toBeVisible();
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
