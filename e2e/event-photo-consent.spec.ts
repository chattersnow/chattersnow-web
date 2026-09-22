// Issue #599: photo and media consent, asked at registration above a box that
// can be left unticked and recorded either way.
//
// The seeded tenant deliberately has no scope -- the platform writes none, and
// `events.photo_consent` is blank on every tenant until somebody fills it in.
// So this spec writes one, exercises it, and takes it away again, which makes
// it a `mutating` spec: `site_content` is shared by the whole site, and a scope
// left standing would put a checkbox in front of every registration in
// e2e/events.spec.ts.
//
// What it covers that no unit or integration test can: that the box actually
// appears in the real form, in the right place, and that **leaving it unticked
// still registers**. That last one is the whole difference from the waiver,
// whose box is `required` -- and a browser is the only place a native
// `required` can be observed not to be there.
import { test, expect } from "./helpers/test";
import { createAdminClient } from "./helpers/admin-client";
import { sayNoMinors } from "./helpers/registration";

const SLOT_KEY = "events.photo_consent";

const SCOPE = [
  "We take photos and video at our events and use them in our own newsletters, on this site, and on our social media accounts.",
  "You do not have to agree, and saying no changes nothing about your spot.",
];

async function writeScope() {
  const admin = createAdminClient();
  const { error } = await admin.from("site_content").upsert(
    {
      key: SLOT_KEY,
      value: SCOPE,
      published_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,key" },
  );
  if (error) throw new Error(`Could not write the scope: ${error.message}`);
}

async function clearScope() {
  const admin = createAdminClient();
  await admin.from("site_content").delete().eq("key", SLOT_KEY);
}

async function openRegistrationForm(page: import("@playwright/test").Page) {
  await page.goto("/events");
  const card = page.locator('a[href^="/events/e/"]').first();
  await card.click();
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Register", exact: true }).click();
  return dialog;
}

test.describe("photo and media consent at registration", () => {
  test.describe.configure({ mode: "serial" });

  test.afterEach(async () => {
    await clearScope();
  });

  test("shows the organization's scope above an unticked box", async ({
    page,
  }) => {
    await writeScope();

    const dialog = await openRegistrationForm(page);

    // The scope itself is on screen, not a link to it: there is no
    // /photo-consent route, deliberately.
    await expect(dialog.getByText(SCOPE[0])).toBeVisible();
    await expect(dialog.getByRole("link", { name: /photo/i })).toHaveCount(0);

    const box = dialog.getByRole("checkbox", {
      name: /happy to be photographed/i,
    });
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();
  });

  // The difference from the waiver, and the only place it can be seen: this box
  // is not `required`, so the browser lets the form through and a decline is
  // stored as a decline rather than refused.
  test("registers with the box left unticked", async ({ page }) => {
    await writeScope();

    const dialog = await openRegistrationForm(page);
    await dialog.getByLabel("Name").fill("Photo Decliner");
    await dialog
      .getByLabel("Email")
      .fill(`photo-decline-${Date.now()}@example.test`);
    await sayNoMinors(dialog);
    await dialog.getByRole("button", { name: "Complete registration" }).click();

    await expect(
      dialog.getByText(/You're registered|registered/i).first(),
    ).toBeVisible();
  });

  test("registers with it ticked", async ({ page }) => {
    await writeScope();

    const dialog = await openRegistrationForm(page);
    await dialog.getByLabel("Name").fill("Photo Consenter");
    await dialog
      .getByLabel("Email")
      .fill(`photo-consent-${Date.now()}@example.test`);
    await dialog
      .getByRole("checkbox", { name: /happy to be photographed/i })
      .check();
    await sayNoMinors(dialog);
    await dialog.getByRole("button", { name: "Complete registration" }).click();

    await expect(
      dialog.getByText(/You're registered|registered/i).first(),
    ).toBeVisible();
  });

  // Where the party includes a minor the label changes and the record does not:
  // still one box, worded in the capacity /terms already claims the registering
  // adult is answering in (#685).
  test("asks in the guardian's capacity for a party with a minor", async ({
    page,
  }) => {
    await writeScope();

    const dialog = await openRegistrationForm(page);
    await dialog.getByLabel(/Is anyone in your party under 18\?/).click();
    await page.getByRole("option", { name: "Yes", exact: true }).click();

    await expect(
      dialog.getByRole("checkbox", { name: /parent or guardian/i }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("checkbox", { name: /photographed/i }),
    ).toHaveCount(1);
  });

  // The state almost every tenant is in, and the one that must never break:
  // no scope, no question, and a form identical to the one before this shipped.
  test("asks nothing for an organization that has written no scope", async ({
    page,
  }) => {
    const dialog = await openRegistrationForm(page);

    await expect(
      dialog.getByRole("checkbox", { name: /photographed/i }),
    ).toHaveCount(0);
    await expect(dialog.getByText("Photos and video")).toHaveCount(0);
  });
});
