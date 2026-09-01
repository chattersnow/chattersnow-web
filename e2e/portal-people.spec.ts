import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";

// Seeded by supabase/seed.sql: Priya Natarajan (volunteer), Jamie Rivera
// (donor), and Summit Outdoor Co. (sponsor) are always present after a
// `supabase db reset`, so read-only tests lean on them instead of creating
// rows of their own.
test.describe("portal people directory", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("lists seeded people with their roles and contact details", async ({
    page,
  }) => {
    // The directory paginates at 50 and the bulk seed data puts ~85 names
    // before Priya, so land on her via the server-side search param instead
    // of expecting her on page 1.
    await page.goto("/portal/people?search=Priya");
    await expect(
      page.getByRole("heading", { level: 1, name: "People", exact: true }),
    ).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: "Priya Natarajan" });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Volunteer");
    await expect(row).toContainText("priya.n@example.test");
  });

  test("opens a person's detail view from the directory", async ({ page }) => {
    // Search first: Priya sits past page 1 of the paginated directory.
    await page.goto("/portal/people?search=Priya");

    // The detail view is a dedicated /portal/people/[id] page since 575e431;
    // the row action is an eye-icon link labeled "View <name>", not the old
    // "View person" sheet button.
    await page.getByRole("link", { name: "View Priya Natarajan" }).click();

    await expect(page).toHaveURL(/\/portal\/people\/[0-9a-f-]+$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Priya Natarajan" }),
    ).toBeVisible();
    const profile = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "Profile" });
    await expect(profile.getByText("priya.n@example.test")).toBeVisible();
    await expect(profile.getByText("Volunteer", { exact: true })).toBeVisible();
  });

  test("searches the directory by name", async ({ page }) => {
    await page.goto("/portal/people");

    await page.getByRole("button", { name: "Filters" }).click();
    const filters = page.getByRole("dialog");
    await filters.getByLabel("Search").fill("Priya");
    await filters.getByRole("button", { name: "Filter" }).click();

    await expect(page).toHaveURL(/search=Priya/);
    await expect(
      page.getByRole("row").filter({ hasText: "Priya Natarajan" }),
    ).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: "Jamie Rivera" }),
    ).toHaveCount(0);
  });

  test("filters the directory by role and clears filters", async ({ page }) => {
    // Apply the role filter via URL: the sheet's form-submit path is
    // already covered by the search test, and a click issued right after
    // the form's native GET navigation can be swallowed while the portal
    // page re-hydrates. page.goto waits for the load event, after which
    // sheet triggers respond reliably (same pattern as the other specs).
    await page.goto("/portal/people?role=is_sponsor");

    await expect(
      page.getByRole("row").filter({ hasText: "Summit Outdoor Co." }),
    ).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: "Priya Natarajan" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Filters" }).click();
    const filters = page.getByRole("dialog");
    await expect(
      filters.getByRole("heading", { name: "Filters" }),
    ).toBeVisible();
    // The Clear control is a Next Link rendered through Base UI's Button
    // (nativeButton={false}), which gives the anchor role="button".
    await filters.getByRole("button", { name: "Clear" }).click();
    await expect(page).toHaveURL(/\/portal\/people$/);
    // Clear navigates client-side (Next Link), so the sheet stays open and
    // the table behind the modal is aria-hidden — invisible to role-based
    // locators. Close the sheet before asserting the unfiltered table.
    await page.keyboard.press("Escape");
    await expect(filters).not.toBeVisible();
    // A non-sponsor row proves the role filter is gone. Priya can't anchor
    // this any more (she's past page 1 of the paginated directory), so use
    // the alphabetically-first seeded non-sponsor instead.
    await expect(
      page.getByRole("row").filter({ hasText: "Alex Chen" }),
    ).toBeVisible();
  });

  test("adds a person and edits them from their detail view", async ({
    page,
  }) => {
    await page.goto("/portal/people");

    const personName = `E2E Person ${Date.now()}`;
    const personEmail = `e2e.person.${Date.now()}@example.test`;

    await page.getByRole("button", { name: "New Person" }).click();
    const addDialog = page.getByRole("dialog");
    await expect(
      addDialog.getByRole("heading", { name: "Add person" }),
    ).toBeVisible();

    await addDialog.getByLabel("Name", { exact: true }).fill(personName);
    await addDialog.getByLabel("Email").fill(personEmail);
    await addDialog.getByLabel("Phone").fill("555-0142");
    await addDialog
      .locator("label")
      .filter({ hasText: "Volunteer" })
      .getByRole("checkbox")
      .click();
    await addDialog.getByRole("button", { name: "Add person" }).click();

    await expect(addDialog).not.toBeVisible();

    // Reload the directory searched down to the new person: the bare list
    // re-renders under the post-add router.refresh() (and the dialog's close
    // transition), which raced the row interactions below in CI, and the
    // paginated full list gives no guarantee the new row lands on page 1.
    await page.goto(`/portal/people?search=${encodeURIComponent(personName)}`);

    const row = page.getByRole("row").filter({ hasText: personName });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Volunteer");
    await expect(row).toContainText(personEmail);

    // The detail view is a dedicated /portal/people/[id] page since 575e431;
    // editing happens inline in its Profile card.
    await page.getByRole("link", { name: `View ${personName}` }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: personName }),
    ).toBeVisible();
    const profile = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "Profile" });
    await expect(profile.getByText(personEmail)).toBeVisible();

    await profile.getByRole("button", { name: "Edit profile" }).click();
    const updatedNotes = `E2E updated notes ${Date.now()}`;
    await profile.getByLabel("Notes").fill(updatedNotes);
    await profile.getByRole("button", { name: "Save changes" }).click();

    await expect(
      profile.getByRole("button", { name: "Edit profile" }),
    ).toBeVisible();
    await expect(profile.getByText(updatedNotes)).toBeVisible();
  });
});
