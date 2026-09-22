// Issue #1376: photos and video, told rather than asked at registration.
//
// #599 put a checkbox here. There is no box now -- registering carries the
// agreement, and the remedy is objection -- so what this spec has to prove is
// an absence in a real browser: that the organization's paragraphs appear, in
// the right place, with **no photo control of any kind**, and that a
// registration taken through the form leaves all three columns null.
//
// The seeded tenant deliberately has no paragraphs -- the platform writes none,
// and `events.photo_consent` is blank on every tenant until somebody fills it
// in. So this spec writes them, exercises them, and takes them away again,
// which makes it a `mutating` spec: `site_content` is shared by the whole site,
// and paragraphs left standing would put a notice in front of every
// registration in e2e/events.spec.ts.
//
// What it covers that no unit or integration test can: that the notice renders
// in the real form and that nothing tickable appears with it. A DOM test can
// count `role="checkbox"` in isolation; only a browser can show that the
// assembled form, with the waiver and the minors question on it, carries
// exactly one box and that it is the waiver's.
import { test, expect } from "./helpers/test";
import { createAdminClient } from "./helpers/admin-client";
import { sayNoMinors } from "./helpers/registration";

const SLOT_KEY = "events.photo_consent";

const SCOPE = [
  "We take photos and video at our events and use them in our own newsletters, on this site, and on our social media accounts.",
  "Registering for one of our events means you are happy for us to do that. Tell any organizer on the day if you would rather we did not.",
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
  if (error) {
    throw new Error(`Could not write the paragraphs: ${error.message}`);
  }
}

async function clearScope() {
  const admin = createAdminClient();
  await admin.from("site_content").delete().eq("key", SLOT_KEY);
}

/** What the row records after a registration taken through the form. */
async function readPhotoColumns(email: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("event_registrations")
    .select("photo_consent, photo_consent_at, photo_consent_text")
    .eq("email", email)
    .single();
  if (error) throw new Error(`Could not read the row: ${error.message}`);
  return data;
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

test.describe("photos and video at registration", () => {
  test.describe.configure({ mode: "serial" });

  test.afterEach(async () => {
    await clearScope();
  });

  test("shows the organization's paragraphs, and no photo control", async ({
    page,
  }) => {
    await writeScope();

    const dialog = await openRegistrationForm(page);

    const heading = dialog.getByRole("heading", { name: "Photos and video" });
    await expect(heading).toBeVisible();
    // The paragraphs themselves are on screen, not a link to them: there is no
    // /photo-consent route, deliberately.
    await expect(dialog.getByText(SCOPE[0])).toBeVisible();
    await expect(dialog.getByRole("link", { name: /photo/i })).toHaveCount(0);

    // #1376's whole point, in the assembled form. Nothing about photos can be
    // ticked -- not a consent box and not a decline box either, which was
    // offered and refused.
    await expect(
      dialog.getByRole("checkbox", { name: /photograph/i }),
    ).toHaveCount(0);
    await expect(
      dialog.getByText(/There is no box to tick here/),
    ).toBeVisible();
  });

  test("registers, and the row records no objection", async ({ page }) => {
    await writeScope();

    const email = `photo-notice-${Date.now()}@example.test`;
    const dialog = await openRegistrationForm(page);
    await dialog.getByLabel("Name").fill("Photo Notice");
    await dialog.getByLabel("Email").fill(email);
    await sayNoMinors(dialog);
    await dialog.getByRole("button", { name: "Complete registration" }).click();

    await expect(
      dialog.getByText(/You're registered|registered/i).first(),
    ).toBeVisible();

    // Null is the resting state: no objection on record, agreement implied by
    // registering. Nothing between the browser and the column may write an
    // answer, and nothing writes `true` -- a form with no affirmative control
    // cannot produce an affirmative record.
    expect(await readPhotoColumns(email)).toEqual({
      photo_consent: null,
      photo_consent_at: null,
      photo_consent_text: null,
    });
  });

  // #1376 dropped the guardian branch with the box it reworded: a
  // platform-written sentence saying a registering adult's submission binds the
  // under-18s in their party would be a guardianship claim the platform is in
  // no position to make.
  test("says nothing about a guardian capacity for a party with a minor", async ({
    page,
  }) => {
    await writeScope();

    const dialog = await openRegistrationForm(page);
    await dialog.getByLabel(/Is anyone in your party under 18\?/).click();
    await page.getByRole("option", { name: "Yes", exact: true }).click();

    await expect(
      dialog.getByRole("heading", { name: "Photos and video" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("checkbox", { name: /photograph/i }),
    ).toHaveCount(0);
    await expect(dialog.getByText(/parent or guardian/i)).toHaveCount(0);
  });

  // The state almost every tenant is in, and the one that must never break:
  // no paragraphs, nothing said, and a form identical to the one before #599
  // shipped.
  test("says nothing for an organization that has written no paragraphs", async ({
    page,
  }) => {
    const dialog = await openRegistrationForm(page);

    await expect(
      dialog.getByRole("checkbox", { name: /photograph/i }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("heading", { name: "Photos and video" }),
    ).toHaveCount(0);
    await expect(dialog.getByText(/There is no box to tick here/)).toHaveCount(
      0,
    );
  });
});
