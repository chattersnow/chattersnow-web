import { test, expect } from "@playwright/test";

// These notices have to be reachable from anywhere on the site, which is why
// they live in the footer's legal bar rather than the header nav. They sit in
// their own "Legal" landmark, separate from the "Footer" one carrying the
// section links -- a utility link is not a site section.
const LEGAL_PAGES = [
  { name: "Privacy Policy", path: "/privacy" },
  { name: "Terms of Use", path: "/terms" },
  { name: "Code of Conduct", path: "/code-of-conduct" },
];

test.describe("legal pages", () => {
  for (const { name, path } of LEGAL_PAGES) {
    test(`${name} page loads`, async ({ page }) => {
      await page.goto(path);

      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
      await expect(page.getByText("Last updated:")).toBeVisible();
    });

    test(`the footer links to ${name} from a public page`, async ({ page }) => {
      await page.goto("/home");

      await page
        .getByRole("navigation", { name: "Legal" })
        .getByRole("link", { name })
        .click();

      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    });
  }
});

// RFC 9116 requires an Expires field and treats the file as invalid once it
// passes -- a security.txt nobody bumps stops being a disclosure route without
// ever failing loudly. This is the alarm for that.
test("security.txt is served and has not expired", async ({ request }) => {
  const response = await request.get("/.well-known/security.txt");
  expect(response.status()).toBe(200);

  const body = await response.text();
  expect(body).toContain("Contact: mailto:security@chattersnow.org");

  const expires = body.match(/^Expires: (.+)$/m)?.[1];
  expect(
    expires,
    "security.txt is missing its required Expires field",
  ).toBeDefined();
  expect(
    new Date(expires!).getTime(),
    `security.txt expired on ${expires} -- bump it, and the note in the file`,
  ).toBeGreaterThan(Date.now());
});
