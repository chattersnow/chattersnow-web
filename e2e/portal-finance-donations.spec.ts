// Issue #440: E2E coverage for /portal/finance/donations. Unlike the other
// Finance subpages, this one is still a "Coming soon" placeholder (see
// src/app/portal/(app)/finance/donations/page.tsx) with no form or table to
// exercise yet, so this stays at the smoke level established by #234 until
// the monetary-donations feature itself is built.
import { test, expect } from "@playwright/test";
import { signIn } from "./helpers/auth";

test("loads the finance Donations page", async ({ page }) => {
  await signIn(page);
  await page.goto("/portal/finance/donations");

  await expect(
    page.getByRole("heading", { level: 1, name: "Donations", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Coming soon")).toBeVisible();
});
