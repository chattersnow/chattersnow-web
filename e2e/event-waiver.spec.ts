// Issue #686: an organization's participant agreement, shown in full where it
// is accepted rather than behind a link, and recorded against the registration
// with the version that was on screen.
//
// The seeded tenant deliberately has no waiver -- the platform ships no text
// for one, and e2e/legal.spec.ts asserts the state of a tenant that has adopted
// nothing. So this spec adopts one, exercises it, and takes it away again,
// which makes it a `mutating` spec: the rows it writes are shared by the whole
// site, and a waiver left standing would refuse every registration in
// e2e/events.spec.ts.
import { test, expect } from "./helpers/test";
import { createAdminClient } from "./helpers/admin-client";
import { modal } from "./helpers/dialog";
import { sayNoMinors } from "./helpers/registration";

const PUBLICATION_KEY = "legal_publication.waiver";
const SLOT_KEY = "legal.waiver";

const WAIVER = {
  title: "Participant Waiver",
  last_updated: "September 22, 2026",
  summary: ["Please read this before you register."],
  sections: [
    {
      id: "risks",
      title: "Risks of taking part",
      paragraphs: [
        "Snow sports are dangerous and people are seriously hurt doing them.",
      ],
    },
  ],
};

/**
 * What `publish_site_content()` writes in one transaction: the text, and the
 * version a registration can point at. Written by hand here because publishing
 * through the portal needs a signed-in admin and a pending draft, and what is
 * under test is the public half.
 *
 * The version row is the half that is easy to forget, and forgetting it is not
 * cosmetic: with text and no version the agreement is in force with nothing to
 * cite, and the RPC refuses every registration.
 */
async function adoptWaiver() {
  const admin = createAdminClient();

  const slot = await admin
    .from("site_content")
    .upsert(
      { key: SLOT_KEY, value: WAIVER, published_at: new Date().toISOString() },
      { onConflict: "tenant_id,key" },
    );
  if (slot.error)
    throw new Error(`Could not write the waiver: ${slot.error.message}`);

  const { data: tenant } = await admin
    .from("site_content")
    .select("tenant_id")
    .eq("key", SLOT_KEY)
    .single();

  const version = await admin.from("legal_document_versions").insert({
    tenant_id: tenant!.tenant_id,
    document: "waiver",
    version: 1,
    content: WAIVER,
    effective_at: new Date().toISOString(),
    time_zone: "UTC",
  });
  if (version.error)
    throw new Error(`Could not version the waiver: ${version.error.message}`);

  const publication = await admin
    .from("app_settings")
    .upsert(
      { key: PUBLICATION_KEY, value: true },
      { onConflict: "tenant_id,key" },
    );
  if (publication.error)
    throw new Error(`Could not adopt the waiver: ${publication.error.message}`);
}

async function withdrawWaiver() {
  const admin = createAdminClient();
  await admin.from("app_settings").delete().eq("key", PUBLICATION_KEY);
  await admin.from("legal_document_versions").delete().eq("document", "waiver");
  await admin.from("site_content").delete().eq("key", SLOT_KEY);
}

async function openRegistrationForm(page: import("@playwright/test").Page) {
  await page.goto("/events");
  const card = page.locator('a[href^="/events/e/"]').first();
  await card.click();
  const dialog = modal(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Register", exact: true }).click();
  return dialog;
}

test.describe("the participant agreement at registration", () => {
  test.describe.configure({ mode: "serial" });

  test.afterEach(async () => {
    await withdrawWaiver();
  });

  test("is shown in full, with an unticked box, and recorded when accepted", async ({
    page,
  }) => {
    await adoptWaiver();

    const dialog = await openRegistrationForm(page);

    // In full: the body of the agreement is on screen, not just its name.
    await expect(
      dialog.getByText(
        "Snow sports are dangerous and people are seriously hurt doing them.",
      ),
    ).toBeVisible();

    const box = dialog.getByRole("checkbox", { name: /I have read the/ });
    await expect(box).not.toBeChecked();

    // And the exact version is reachable as its own page, which is what the
    // stored pointer resolves to.
    await expect(
      dialog.getByRole("link", { name: /open this version/i }),
    ).toHaveAttribute("href", "/waiver?version=1");

    await dialog.getByLabel("Name").fill("Waiver Tester");
    await dialog.getByLabel("Email").fill(`waiver-${Date.now()}@example.test`);
    await box.check();
    await sayNoMinors(dialog);
    await dialog.getByRole("button", { name: "Complete registration" }).click();

    await expect(
      dialog.getByText(/You're registered|registered/i).first(),
    ).toBeVisible();
  });

  test("refuses a registration that leaves the box unticked", async ({
    page,
  }) => {
    await adoptWaiver();

    const dialog = await openRegistrationForm(page);
    await dialog.getByLabel("Name").fill("Waiver Refuser");
    await dialog
      .getByLabel("Email")
      .fill(`waiver-refused-${Date.now()}@example.test`);
    // Answered, so the box is unambiguously what stops this submission.
    await sayNoMinors(dialog);
    await dialog.getByRole("button", { name: "Complete registration" }).click();

    // Still on the form. The browser's own `required` stops it here; the RPC
    // refuses the same submission independently, which the integration tests
    // cover and a browser cannot reach.
    await expect(
      dialog.getByRole("checkbox", { name: /I have read the/ }),
    ).toBeVisible();
  });

  test("serves /waiver and links it from the footer once adopted", async ({
    page,
  }) => {
    await adoptWaiver();

    const response = await page.goto("/waiver");
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: "Participant Waiver" }),
    ).toBeVisible();

    await expect(
      page
        .getByRole("navigation", { name: "Legal" })
        .getByRole("link", { name: "Participant Waiver" }),
    ).toBeVisible();
  });

  // The platform writes no waiver, so a tenant that has adopted none has
  // nothing: no page, no footer link, and a registration form that asks about
  // no agreement at all. This is the state almost every tenant is in.
  test("is absent entirely for a tenant that has adopted none", async ({
    page,
  }) => {
    const response = await page.goto("/waiver");
    expect(response?.status()).toBe(404);

    await page.goto("/home");
    await expect(
      page
        .getByRole("navigation", { name: "Legal" })
        .getByRole("link", { name: "Participant Waiver" }),
    ).toHaveCount(0);

    const dialog = await openRegistrationForm(page);
    await expect(
      dialog.getByRole("checkbox", { name: /I have read the/ }),
    ).toHaveCount(0);
  });
});
