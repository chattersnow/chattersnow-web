import { test, expect } from "@playwright/test";
import { modal } from "./helpers/dialog";

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

    const dialog = modal(page);
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

    // The rider-profile prompt continues from the confirmation (#564).
    await registrationDialog
      .getByRole("combobox", { name: "Do you ski or ride?" })
      .click();
    await page.getByRole("option", { name: "Both" }).click();

    await registrationDialog
      .getByRole("combobox", { name: "Experience on skis" })
      .click();
    await page.getByRole("option", { name: "Beginner" }).click();

    await registrationDialog
      .getByRole("combobox", { name: "Experience on a snowboard" })
      .click();
    await page.getByRole("option", { name: "Advanced" }).click();

    await registrationDialog
      .getByRole("combobox", { name: "Preferred mountain for meetups" })
      .click();
    await page.getByRole("option", { name: "Hunter" }).click();

    await registrationDialog
      .getByRole("button", { name: "Save details" })
      .click();

    await expect(
      registrationDialog.getByText(
        "Thanks — we'll use this to point you at the right group.",
      ),
    ).toBeVisible();
  });

  test("skipping the rider profile leaves the registration confirmed", async ({
    page,
  }) => {
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

    const uniqueEmail = `e2e-skip-${Date.now()}@example.test`;
    await registrationDialog.getByLabel("Name").fill("E2E Skipping Registrant");
    await registrationDialog.getByLabel("Email").fill(uniqueEmail);
    await registrationDialog.getByRole("button", { name: "Register" }).click();

    const confirmation = registrationDialog.getByText(
      "You're registered! We look forward to seeing you there.",
    );
    await expect(confirmation).toBeVisible();

    await registrationDialog.getByRole("button", { name: "Skip" }).click();

    // The prompt goes away; the registration stands.
    await expect(
      registrationDialog.getByRole("button", { name: "Save details" }),
    ).toBeHidden();
    await expect(confirmation).toBeVisible();
  });
});
