import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { modal } from "./helpers/dialog";

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("opens the how-to sheet on the Events page and shows its guidance", async ({
  page,
}) => {
  await page.goto("/portal/events");
  await expect(
    page.getByRole("heading", { level: 1, name: "Events", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Help for this page" }).click();

  const dialog = modal(page);
  await expect(
    dialog.getByRole("heading", {
      name: "How status, visibility, and the section rail work",
    }),
  ).toBeVisible();
  await expect(dialog.getByText("Who can do this")).toBeVisible();
  await expect(dialog.getByText("Common mistakes")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("opens the how-to sheet on the Roles page and shows its guidance", async ({
  page,
}) => {
  // The Permissions tab, reached by the URL the old Permissions page had
  // before #946 merged the two -- one help entry now covers both tabs.
  await page.goto("/portal/administration/permissions");
  await expect(page).toHaveURL(
    /\/portal\/administration\/roles\?tab=permissions$/,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Roles", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Help for this page" }).click();

  const dialog = modal(page);
  await expect(
    dialog.getByRole("heading", {
      name: "How roles and permissions work",
    }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Administration (users, permissions, settings"),
  ).toBeVisible();
});
