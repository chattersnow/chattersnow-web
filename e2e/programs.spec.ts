import { test, expect } from "./helpers/test";

test.describe("public programs page", () => {
  test("programs page loads", async ({ page }) => {
    await page.goto("/programs");
    await expect(
      page.getByRole("heading", { level: 1, name: "Programs" }),
    ).toBeVisible();
  });

  // TODO(#360): re-add a "nav resolves to Programs" test once the public
  // nav's Programs link is restored.
});
