import { test, expect } from "@playwright/test";

const EVENT_NAME = "Winter Gear Swap";

test.describe("public events", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "Upcoming events" }),
    ).toBeVisible();
  });

  test("browsing the list and viewing an event's details", async ({ page }) => {
    await page
      .getByRole("button", { name: new RegExp(EVENT_NAME, "i") })
      .click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: EVENT_NAME }),
    ).toBeVisible();
  });

  test("submitting an event registration from the sheet", async ({ page }) => {
    await page
      .getByRole("button", { name: new RegExp(EVENT_NAME, "i") })
      .click();

    const detailDialog = page.getByRole("dialog", { name: EVENT_NAME });
    await expect(
      detailDialog.getByRole("heading", { name: EVENT_NAME }),
    ).toBeVisible();

    await detailDialog
      .getByRole("button", { name: "Register for this event" })
      .click();

    const registrationDialog = page.getByRole("dialog", { name: "Register" });
    await expect(
      registrationDialog.getByRole("heading", { name: "Register" }),
    ).toBeVisible();

    const uniqueEmail = `e2e-${Date.now()}@example.test`;
    await registrationDialog.getByLabel("Name").fill("E2E Test Registrant");
    await registrationDialog.getByLabel("Email").fill(uniqueEmail);
    await registrationDialog.getByRole("button", { name: "Register" }).click();

    await expect(
      registrationDialog.getByText(
        "You're registered! We look forward to seeing you there.",
      ),
    ).toBeVisible();
  });
});
