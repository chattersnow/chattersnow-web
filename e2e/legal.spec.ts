import { test, expect } from "./helpers/test";
import { LEGAL_PAGES_PUBLISHED } from "../src/lib/legal-pages";

// These notices have to be reachable from anywhere on the site, which is why
// they live in the footer's legal bar rather than the header nav. They sit in
// their own "Legal" landmark, separate from the "Footer" one carrying the
// section links -- a utility link is not a site section.
const LEGAL_PAGES = [
  { name: "Privacy Policy", path: "/privacy" },
  { name: "Terms of Use", path: "/terms" },
  { name: "Code of Conduct", path: "/code-of-conduct" },
];

// Which of these two suites runs is decided by LEGAL_PAGES_PUBLISHED rather
// than by editing this file, so flipping that one constant when the board's
// legal review approves the documents (#769) moves the coverage with it. The
// gated half is not a placeholder: while the flag is off, "these routes are
// unreachable and unlinked" is the behaviour worth protecting, since the whole
// point of the gate is that unapproved text must not be published.
if (LEGAL_PAGES_PUBLISHED) {
  test.describe("legal pages", () => {
    for (const { name, path } of LEGAL_PAGES) {
      test(`${name} page loads`, async ({ page }) => {
        await page.goto(path);

        await expect(
          page.getByRole("heading", { level: 1, name }),
        ).toBeVisible();
        await expect(page.getByText("Last updated:")).toBeVisible();
      });

      test(`the footer links to ${name} from a public page`, async ({
        page,
      }) => {
        await page.goto("/home");

        await page
          .getByRole("navigation", { name: "Legal" })
          .getByRole("link", { name })
          .click();

        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await expect(
          page.getByRole("heading", { level: 1, name }),
        ).toBeVisible();
      });
    }
  });
} else {
  test.describe("legal pages (awaiting legal approval)", () => {
    for (const { name, path } of LEGAL_PAGES) {
      test(`${name} is not served`, async ({ page }) => {
        const response = await page.goto(path);

        // The document exists in the repository, so a 200 here would mean the
        // gate had come off without the review -- the one failure this suite
        // is here to catch.
        expect(response?.status()).toBe(404);
      });
    }

    test("the footer has no legal bar", async ({ page }) => {
      await page.goto("/home");

      // The landmark is omitted rather than emptied: an empty
      // <nav aria-label="Legal"> is still announced by screen readers.
      await expect(page.getByRole("navigation", { name: "Legal" })).toHaveCount(
        0,
      );

      // The rest of the footer is untouched, which is what distinguishes the
      // gate from the footer having failed to render at all.
      await expect(
        page.getByRole("navigation", { name: "Footer" }),
      ).toBeVisible();

      for (const { name } of LEGAL_PAGES) {
        await expect(page.getByRole("link", { name })).toHaveCount(0);
      }
    });
  });
}

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
