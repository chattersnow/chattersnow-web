import { test, expect } from "./helpers/test";
import { clickNavLink } from "./helpers/nav";
import { createAdminClient } from "./helpers/admin-client";

test.describe("public contact page", () => {
  test("contact page loads", async ({ page }) => {
    await page.goto("/contact");
    await expect(
      page.getByRole("heading", { level: 1, name: "Get in touch" }),
    ).toBeVisible();
  });

  test("nav resolves to Contact", async ({ page }) => {
    await page.goto("/home");
    await clickNavLink(page, "Contact");

    await expect(page).toHaveURL(/\/contact$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Get in touch" }),
    ).toBeVisible();
  });

  test("submitting the contact form shows the success state", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const suffix = crypto.randomUUID().slice(0, 8);
    const email = `e2e-contact-${suffix}@example.test`;

    try {
      await page.goto("/contact");

      await page.getByLabel("Name", { exact: true }).fill("E2E Contact");
      await page.getByLabel("Email").fill(email);
      await page
        .getByLabel("Message")
        .fill("Checking in from the end-to-end suite.");
      await page.getByRole("button", { name: "Send message" }).click();

      await expect(page.getByText("Thanks for reaching out!")).toBeVisible();
      // The success state replaces the form outright, so the fields going
      // away is part of what "submitted" means here.
      await expect(page.getByLabel("Message")).not.toBeAttached();
    } finally {
      await admin.from("contact_messages").delete().eq("email", email);
    }
  });

  test("the contact form won't submit with a missing name or a malformed email", async ({
    page,
  }) => {
    await page.goto("/contact");

    const name = page.getByLabel("Name", { exact: true });
    const email = page.getByLabel("Email");
    const message = page.getByLabel("Message");
    const submit = page.getByRole("button", { name: "Send message" });

    // Every guard here is native constraint validation (`required`,
    // type="email") rather than a rendered message, so assert on the
    // inputs' validity state -- there is no error text to look for.
    await submit.click();
    expect(
      await name.evaluate(
        (input: HTMLInputElement) => input.validity.valueMissing,
      ),
    ).toBe(true);

    await name.fill("E2E Contact");
    await email.fill("not-an-email");
    await message.fill("Checking in from the end-to-end suite.");
    await submit.click();
    expect(
      await email.evaluate(
        (input: HTMLInputElement) => input.validity.typeMismatch,
      ),
    ).toBe(true);

    // Neither attempt reached the server, so the form is still on screen.
    await expect(submit).toBeVisible();
    await expect(page.getByText("Thanks for reaching out!")).toHaveCount(0);
  });
});
