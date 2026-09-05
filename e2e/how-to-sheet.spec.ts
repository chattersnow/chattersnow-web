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
      name: "How status, visibility, and phase tabs work",
    }),
  ).toBeVisible();
  await expect(dialog.getByText("Who can do this")).toBeVisible();
  await expect(dialog.getByText("Common mistakes")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("opens the how-to sheet on the Permissions page and shows its guidance", async ({
  page,
}) => {
  await page.goto("/portal/administration/permissions");
  await expect(
    page.getByRole("heading", { level: 1, name: "Permissions", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Help for this page" }).click();

  const dialog = modal(page);
  await expect(
    dialog.getByRole("heading", {
      name: "How the permissions matrix works",
    }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Administration (users, permissions, settings"),
  ).toBeVisible();
});
