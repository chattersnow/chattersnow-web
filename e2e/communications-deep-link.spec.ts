// #430: a message opened from the "new messages" dashboard notification
// (?status=new deep link) used to disappear from the table the moment it
// was auto-marked read, since the status filter was still pinned to "new".
// Seeds its own contact_message (rather than relying on the shared seed
// data) so this test doesn't race other e2e runs mutating the same rows.
import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { modal } from "./helpers/dialog";

async function seedNewMessage(admin: ReturnType<typeof createAdminClient>) {
  const suffix = crypto.randomUUID().slice(0, 8);
  const name = `E2E Contact ${suffix}`;

  const { data, error } = await admin
    .from("contact_messages")
    .insert({
      name,
      email: `e2e-contact-${suffix}@example.test`,
      topic: "general",
      message: "Testing the deep-linked notification flow.",
      status: "new",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw error ?? new Error("insert returned no row");
  }

  return {
    id: data.id as string,
    name,
    async cleanup() {
      await admin.from("contact_messages").delete().eq("id", data.id);
    },
  };
}

test("a message opened from a ?status=new deep link stays visible after being marked read", async ({
  page,
}) => {
  const admin = createAdminClient();
  const fixture = await seedNewMessage(admin);

  try {
    await signIn(page);
    await page.goto("/portal/communications?status=new");

    const row = page.getByRole("row").filter({ hasText: fixture.name });
    await expect(row).toBeVisible();
    await expect(row.getByText("New", { exact: true })).toBeVisible();

    await row
      .getByRole("button", { name: `View message from ${fixture.name}` })
      .click();
    const sheet = modal(page);
    await expect(sheet.getByText("Contact message")).toBeVisible();

    // Opening the sheet auto-marks the message read via a Server Action.
    // The background table is legitimately marked inert (aria-hidden)
    // while the modal sheet is open, so the row isn't expected to be
    // "visible" (Playwright respects aria-hidden) until it closes -- the
    // bug this test guards is about what happens after: does the row stay
    // in the status=new-filtered table once its status has moved off
    // "new", instead of the pinned filter hiding it.
    await sheet.getByRole("button", { name: "Close" }).click();

    // The mutation's round trip plus Next's revalidation can take longer
    // than the default assertion timeout under CI load, so give the
    // status badge more headroom while continuously checking the row
    // itself never disappears.
    await expect(row).toBeVisible();
    await expect(row.getByText("Read", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(row).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});

test("the status filter still narrows normally without a pinned deep link", async ({
  page,
}) => {
  const admin = createAdminClient();
  const fixture = await seedNewMessage(admin);

  try {
    await signIn(page);
    await page.goto("/portal/communications");

    const row = page.getByRole("row").filter({ hasText: fixture.name });
    await expect(row).toBeVisible();

    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.getByRole("combobox", { name: "Filter by status" }).click();
    await page.getByRole("option", { name: "resolved", exact: true }).click();

    // Not a deep link, so no stickiness -- a "new" message doesn't match a
    // "resolved" filter and should be hidden like any other row.
    await expect(row).not.toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});
