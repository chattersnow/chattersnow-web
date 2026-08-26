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

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: EVENT_NAME }),
    ).toBeVisible();

    const uniqueEmail = `e2e-${Date.now()}@example.test`;
    await dialog.getByLabel("Name").fill("E2E Test Registrant");
    await dialog.getByLabel("Email").fill(uniqueEmail);
    await dialog.getByRole("button", { name: "Register" }).click();

    await expect(
      dialog.getByText(
        "You're registered! We look forward to seeing you there.",
      ),
    ).toBeVisible();
  });
});
