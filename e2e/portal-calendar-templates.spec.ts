// Issue #443: E2E coverage for /portal/calendar/templates.
//
// Read-only assertions use the starter templates seeded by migration
// 20260824105000_seed_content_brief_templates.sql ("Community spotlight" is
// additionally flagged requires_consent by 20260826130000). Write flows
// create their own template with a run-unique key and name, because the
// suite runs fully parallel across two Playwright projects against one
// database -- anything shared would race.
import { test, expect } from "./helpers/test";
import { reloadStayingSignedIn, signIn } from "./helpers/auth";
import { modal } from "./helpers/dialog";

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
        name: "Brief Templates",
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

  test("links a seeded template to its detail page including its pinned field list", async ({
    page,
  }) => {
    await page.goto("/portal/calendar/templates");

    // Since #469 the row's View action is a link to the template's
    // dedicated detail page rather than a sheet trigger.
    await page
      .getByRole("button", { name: "View Community spotlight" })
      .click();

    await expect(page).toHaveURL(
      /\/portal\/calendar\/templates\/[0-9a-f-]{36}$/,
      { timeout: 15_000 },
    );
    await expect(
      page.getByRole("heading", { level: 1, name: "Community spotlight" }),
    ).toBeVisible();
    // ReadOnlyField renders a labelled <div> rather than a form control, so
    // these read by id instead of by label.
    await expect(page.locator("#template-view-key")).toHaveText(
      "community_spotlight",
    );
    await expect(page.locator("#template-view-active")).toHaveText("Yes");
    await expect(page.locator("#template-view-requires-consent")).toHaveText(
      "Yes",
    );

    await expect(page.getByText("Current fields (v1)")).toBeVisible();
    await expect(page.locator("#template-view-fields")).toContainText(
      "Person or group",
    );
    await expect(page.locator("#template-view-fields")).toContainText(
      "Permission to publish + usage limits",
    );

    // The breadcrumb trail returns to the list.
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Brief Templates", exact: true })
      .click();
    await expect(page).toHaveURL(/\/portal\/calendar\/templates$/);
  });

  test("creates a template, edits its details, and revises its fields into a new version", async ({
    page,
  }) => {
    const suffix = uniqueSuffix();
    const templateKey = `e2e_tpl_${suffix}`;
    const templateName = `E2E Template ${suffix}`;

    await page.goto("/portal/calendar/templates");

    await page.getByRole("button", { name: "New template" }).click();
    const dialog = modal(page);
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

    // Creating triggers a router.refresh() that re-renders the table; a
    // click racing that re-render can land on a node React just replaced
    // and go nowhere. Reload so the list is settled before navigating.
    await reloadStayingSignedIn(page);

    const row = page.getByRole("row").filter({ hasText: templateName });
    await expect(row).toBeVisible();
    await expect(row).toContainText(templateKey);
    await expect(row).toContainText("v1");

    // Since #469 details live on a dedicated page; both edit flows stay on
    // sheets opened from the page header.
    await row.getByRole("button", { name: `View ${templateName}` }).click();
    await expect(page).toHaveURL(
      /\/portal\/calendar\/templates\/[0-9a-f-]{36}$/,
      { timeout: 15_000 },
    );
    await expect(page.locator("#template-view-fields")).toContainText(
      "Headline",
    );
    // Not opted into the consent gate on create.
    await expect(page.locator("#template-view-requires-consent")).toHaveText(
      "No",
    );

    // Editing metadata leaves the pinned version alone.
    await page.getByRole("button", { name: "Edit details" }).click();
    const detailsSheet = modal(page);
    const updatedDescription = `E2E updated description ${suffix}`;
    await detailsSheet.getByLabel("Description").fill(updatedDescription);
    await detailsSheet.getByRole("button", { name: "Save changes" }).click();
    await expect(detailsSheet).not.toBeVisible();

    await expect(page.locator("#template-view-description")).toHaveText(
      updatedDescription,
    );
    await expect(page.getByText("Current fields (v1)")).toBeVisible();

    // Revising the field list publishes v2 instead of mutating v1.
    await page.getByRole("button", { name: "Revise fields" }).click();
    const fieldsSheet = modal(page);
    await fieldsSheet.getByRole("button", { name: "Add field" }).click();
    await fieldsSheet.locator("#field-key-1").fill("call_to_action");
    await fieldsSheet.locator("#field-label-1").fill("Call to action");
    await fieldsSheet.getByRole("button", { name: "Save changes" }).click();
    await expect(fieldsSheet).not.toBeVisible();

    await expect(page.getByText("Current fields (v2)")).toBeVisible();
    await expect(page.locator("#template-view-fields")).toContainText(
      "Call to action",
    );

    // Back on the list, the row picked up the new version.
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Brief Templates", exact: true })
      .click();
    await expect(page).toHaveURL(/\/portal\/calendar\/templates$/);
    await expect(
      page.getByRole("row").filter({ hasText: templateName }),
    ).toContainText("v2");
  });

  test("rejects a template key that isn't a valid identifier", async ({
    page,
  }) => {
    await page.goto("/portal/calendar/templates");

    await page.getByRole("button", { name: "New template" }).click();
    const dialog = modal(page);

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
