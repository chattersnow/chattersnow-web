import { test, expect } from "./helpers/test";

// The legal notices have to be reachable from anywhere on the site, which is
// why they live in the footer's legal bar rather than the header nav. They sit
// in their own "Legal" landmark, separate from the "Footer" one carrying the
// section links -- a utility link is not a site section.
//
// What this file asserts is the state of a tenant that has adopted nothing,
// which is what the seeded tenant is and what every newly provisioned tenant
// starts as (#859): the privacy policy is served and linked, and the other two
// are not. Putting one in force is `legal-publication.spec.ts`, which mutates a
// real row and therefore runs alone in the `mutating` project.

test.describe("legal documents a tenant has not adopted", () => {
  for (const path of ["/terms", "/code-of-conduct"]) {
    test(`${path} is not served`, async ({ page }) => {
      const response = await page.goto(path);

      // A 200 here would mean text nobody adopted is being published under this
      // organization's name, which is the one failure this gate exists to
      // prevent.
      expect(response?.status()).toBe(404);
    });
  }

  test("the footer links to neither", async ({ page }) => {
    await page.goto("/home");

    const legal = page.getByRole("navigation", { name: "Legal" });
    await expect(legal.getByRole("link", { name: "Terms of Use" })).toHaveCount(
      0,
    );
    await expect(
      legal.getByRole("link", { name: "Code of Conduct" }),
    ).toHaveCount(0);
  });
});

// The one route that must never 404 while the site is collecting personal
// information through its public forms. It has no publication state and no
// visibility slot, and since #858 there is always something to serve: this
// tenant's own document, or the platform's neutral default.
test.describe("the privacy policy", () => {
  test("is served, whether or not the tenant has written its own", async ({
    page,
  }) => {
    const response = await page.goto("/privacy");

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: "Privacy Policy" }),
    ).toBeVisible();
    await expect(page.getByText("Last updated:")).toBeVisible();
  });

  test("is reachable from the footer of a public page", async ({ page }) => {
    await page.goto("/home");

    await page
      .getByRole("navigation", { name: "Legal" })
      .getByRole("link", { name: "Privacy Policy" })
      .click();

    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Privacy Policy" }),
    ).toBeVisible();
  });

  // The landmark carries the privacy policy alone here, which is exactly why it
  // is never rendered empty: an empty <nav aria-label="Legal"> is announced by
  // screen readers as a landmark with nothing in it.
  test("the rest of the footer is untouched", async ({ page }) => {
    await page.goto("/home");

    await expect(
      page.getByRole("navigation", { name: "Footer" }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Legal" }).getByRole("link"),
    ).toHaveCount(1);
  });
});

// security.txt is rendered for the tenant the host resolves to (#975), so this
// asserts the seeded tenant's own contact rather than a name baked into a
// static file. The two fields that used to be hand-maintained are the ones
// worth checking end to end: RFC 9116 treats a file whose Expires has passed,
// or whose Canonical is not where it was fetched from, as invalid.
test("security.txt is served for this host and has not expired", async ({
  request,
  baseURL,
}) => {
  const response = await request.get("/.well-known/security.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");

  const body = await response.text();
  expect(body).toContain("Contact: mailto:security@example.org");
  expect(body).not.toMatch(/chatter/i);

  expect(body).toContain(
    `Canonical: ${new URL("/.well-known/security.txt", baseURL).toString()}`,
  );

  // The seeded tenant has adopted no terms, so /terms 404s and the optional
  // Policy field has nowhere honest to point.
  expect(body).not.toContain("Policy:");

  const expires = body.match(/^Expires: (.+)$/m)?.[1];
  expect(
    expires,
    "security.txt is missing its required Expires field",
  ).toBeDefined();
  expect(
    new Date(expires!).getTime(),
    `security.txt expired on ${expires} -- the route computes this field, so an expired one is a bug in securityTxtExpires()`,
  ).toBeGreaterThan(Date.now());
});
