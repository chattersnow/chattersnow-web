// Issue #443: E2E coverage for /portal/calendar/templates.
//
// Read-only assertions use the starter templates seeded by migration
// 20260824105000_seed_content_brief_templates.sql ("Community spotlight" is
// additionally flagged requires_consent by 20260826130000). Write flows
// create their own template with a run-unique key and name, because the
// suite runs fully parallel across two Playwright projects against one
// database -- anything shared would race.
import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";

function uniqueSuffix() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

test.describe("portal calendar brief templates", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("lists the seeded starter templates with their version and flags", async ({
    page,
  }) => {
    await page.goto("/portal/calendar/templates");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Brief templates",
        exact: true,
      }),
    ).toBeVisible();

    const spotlight = page
      .getByRole("row")
      .filter({ hasText: "Community spotlight" });
    await expect(spotlight).toContainText("community_spotlight");
    await expect(spotlight).toContainText("v1");

    await expect(
      page
        .getByRole("row")
        .filter({ hasText: "Awareness or community moment" }),
    ).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: "Partner spotlight" }),
    ).toBeVisible();
  });

  test("opens a seeded template's details including its pinned field list", async ({
    page,
  }) => {
    await page.goto("/portal/calendar/templates");

    await page
      .getByRole("button", { name: "View Community spotlight" })
      .click();

    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByRole("heading", { name: "Content brief template" }),
    ).toBeVisible();
    // ReadOnlyField renders a labelled <div> rather than a form control, so
    // these read by id instead of by label.
    await expect(sheet.locator("#template-view-key")).toHaveText(
      "community_spotlight",
    );
    await expect(sheet.locator("#template-view-active")).toHaveText("Yes");
    await expect(sheet.locator("#template-view-requires-consent")).toHaveText(
      "Yes",
    );

    await expect(sheet.getByText("Current fields (v1)")).toBeVisible();
    await expect(sheet.locator("#template-view-fields")).toContainText(
      "Person or group",
    );
    await expect(sheet.locator("#template-view-fields")).toContainText(
      "Permission to publish + usage limits",
    );
  });

  test("creates a template, edits its details, and revises its fields into a new version", async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const templateKey = `e2e_tpl_${suffix}`;
    const templateName = `E2E Template ${suffix}`;

    await page.goto("/portal/calendar/templates");

    await page.getByRole("button", { name: "New template" }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Create content brief template" }),
    ).toBeVisible();

    await dialog.getByLabel("Key", { exact: true }).fill(templateKey);
    await dialog.getByLabel("Name", { exact: true }).fill(templateName);
    await dialog.getByLabel("Description").fill("Created by an e2e test.");
    await dialog.locator("#field-key-0").fill("headline");
    await dialog.locator("#field-label-0").fill("Headline");
    await dialog.getByRole("button", { name: "Create template" }).click();

    await expect(dialog).not.toBeVisible();

    const row = page.getByRole("row").filter({ hasText: templateName });
    await expect(row).toBeVisible();
    await expect(row).toContainText(templateKey);
    await expect(row).toContainText("v1");

    await row.getByRole("button", { name: `View ${templateName}` }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.locator("#template-view-fields")).toContainText(
      "Headline",
    );
    // Not opted into the consent gate on create.
    await expect(sheet.locator("#template-view-requires-consent")).toHaveText(
      "No",
    );

    // Editing metadata leaves the pinned version alone.
    await sheet.getByRole("button", { name: "Edit template details" }).click();
    const updatedDescription = `E2E updated description ${suffix}`;
    await sheet.getByLabel("Description").fill(updatedDescription);
    await sheet.getByRole("button", { name: "Save changes" }).click();

    await expect(
      sheet.getByRole("button", { name: "Edit template details" }),
    ).toBeVisible();
    await expect(sheet.locator("#template-view-description")).toHaveText(
      updatedDescription,
    );
    await expect(sheet.getByText("Current fields (v1)")).toBeVisible();

    // Revising the field list publishes v2 instead of mutating v1.
    await sheet.getByRole("button", { name: "Revise template fields" }).click();
    await sheet.getByRole("button", { name: "Add field" }).click();
    await sheet.locator("#field-key-1").fill("call_to_action");
    await sheet.locator("#field-label-1").fill("Call to action");
    await sheet.getByRole("button", { name: "Save changes" }).click();

    await expect(sheet.getByText("Current fields (v2)")).toBeVisible();
    await expect(sheet.locator("#template-view-fields")).toContainText(
      "Call to action",
    );

    // The sheet is modal, so while it's open the table behind it is out of
    // the accessibility tree and getByRole("row") can't see it. Close it
    // before checking the row picked up the new version.
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(row).toContainText("v2");
  });

  test("rejects a template key that isn't a valid identifier", async ({
    page,
  }) => {
    await page.goto("/portal/calendar/templates");

    await page.getByRole("button", { name: "New template" }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Key", { exact: true }).fill("Not A Key");
    await dialog
      .getByLabel("Name", { exact: true })
      .fill(`E2E Invalid ${uniqueSuffix()}`);
    await dialog.locator("#field-key-0").fill("headline");
    await dialog.locator("#field-label-0").fill("Headline");
    await dialog.getByRole("button", { name: "Create template" }).click();

    await expect(
      dialog.getByText(
        "Template key must be lowercase letters, numbers, and underscores, starting with a letter.",
      ),
    ).toBeVisible();
    // Nothing was created, so the dialog stays open on the bad input.
    await expect(
      dialog.getByRole("heading", { name: "Create content brief template" }),
    ).toBeVisible();
  });
});
