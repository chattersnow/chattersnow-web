// Issue #584: the board hides a whole public section from Administration >
// System Settings. Hiding it must remove it from the nav *and* make its URLs
// unreachable -- a link the nav no longer renders is still a live page.
import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";

const SLOT = "support";
const KEY = `page_visibility.${SLOT}`;

async function setVisibility(visible: boolean) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("app_settings")
    .upsert({ key: KEY, value: visible }, { onConflict: "key" });
  if (error) throw new Error(`Could not set ${KEY}: ${error.message}`);
}

test.describe("board-controlled page visibility", () => {
  // Visibility is one app_settings row shared by the whole site, so this file
  // mutates global state and cannot run concurrently with itself: in parallel,
  // one case's afterEach restores the section while another is still asserting
  // it is gone. Serial mode handles that within a project, and the skip below
  // keeps the browser projects from racing each other. The gate is server-side,
  // so there is nothing browser-specific to gain from running it more than once.
  test.describe.configure({ mode: "serial" });
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Mutates a global app_settings row; see comment above.",
    );
  });

  // seed.sql leaves Support visible locally; restore that however a test ends.
  test.afterEach(async () => {
    await setVisibility(true);
  });

  test("a visible section is reachable and listed in the nav", async ({
    page,
  }) => {
    await setVisibility(true);
    await page.goto("/support");

    await expect(
      page.getByRole("heading", { level: 1, name: "Support Chatter" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation")
        .getByText("Support", { exact: true })
        .first(),
    ).toBeVisible();
  });

  test("hiding a section makes every page beneath it 404", async ({ page }) => {
    await setVisibility(false);

    for (const path of [
      "/support",
      "/support/donations",
      "/support/sponsorship",
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} should be hidden`).toBe(404);
    }
  });

  test("a hidden section disappears from the nav and footer", async ({
    page,
  }) => {
    await setVisibility(false);
    await page.goto("/home");

    await expect(
      page.getByRole("navigation").getByText("Support", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "Support" }),
    ).toHaveCount(0);
    // Sections the board hasn't hidden are untouched.
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "Contact" }),
    ).toBeVisible();
  });

  // The whole point of the ticket: a board member does this themselves, with
  // no developer and no deploy.
  test("a board member can hide a section from the portal", async ({
    page,
  }) => {
    await setVisibility(true);
    await signIn(page, { email: "board@example.test" });

    await page.goto("/portal/administration/system-settings");
    await page.getByRole("tab", { name: "Page visibility" }).click();

    const supportSwitch = page.getByRole("switch", { name: "Support" });
    await expect(supportSwitch).toBeChecked();
    await supportSwitch.click();
    await expect(supportSwitch).not.toBeChecked();

    // The switch updates optimistically, so its state alone doesn't prove the
    // Server Action landed -- poll the public site for the real effect.
    await expect
      .poll(async () => (await page.request.get("/support")).status())
      .toBe(404);
  });
});
