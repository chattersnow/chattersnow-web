import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { portalMain } from "./helpers/regions";

const EXPENSE_THRESHOLD_KEY = "finance.expense_approval_threshold";

test.describe("portal administration organization settings", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("loads Organization Settings and switches between its tabs", async ({
    page,
  }) => {
    await page.goto("/portal/administration/organization-settings");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Organization Settings",
        exact: true,
      }),
    ).toBeVisible();

    // The page opens on General (the fiscal year setting); the approval
    // thresholds moved behind "Workflow settings" when that tab was added.
    // The tab was called Organization until #992 renamed the page, at which
    // point the page and its first tab would have been the same word.
    await expect(page.getByRole("tab", { name: "General" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByLabel("Fiscal year starts in")).toBeVisible();

    await page.getByRole("tab", { name: "Workflow settings" }).click();
    await expect(page.getByText("Expense approval threshold")).toBeVisible();
    await expect(
      page.getByText("Reimbursement approval threshold"),
    ).toBeVisible();
    await expect(portalMain(page).locator("#expense-threshold")).toBeVisible();

    await page.getByRole("tab", { name: "Branding" }).click();
    await expect(page.getByLabel("Logo URL")).toBeVisible();

    await page.getByRole("tab", { name: "Data" }).click();
    await expect(page.getByText("Download export")).toBeVisible();
  });

  // #947: panels that could not be linked, bookmarked or returned to. Five
  // of them since #990 took Layout, Page visibility and Legal documents to
  // the Website section.
  test("a tab is addressable, survives a reload, and comes back with Back", async ({
    page,
  }) => {
    // Deep link straight into a panel, which is what every cross-link in the
    // portal now does -- the finance pages point at Workflow settings, and My
    // Account and the ops report email at Notifications.
    await page.goto(
      "/portal/administration/organization-settings?tab=branding",
    );
    await expect(page.getByRole("tab", { name: "Branding" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByLabel("Logo URL")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("tab", { name: "Branding" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.getByRole("tab", { name: "Notifications" }).click();
    await expect(page).toHaveURL(/\?tab=notifications$/);
    await page.goBack();
    await expect(page).toHaveURL(/\?tab=branding$/);
    await expect(page.getByRole("tab", { name: "Branding" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // A hand-edited or stale value falls back rather than rendering nothing.
    await page.goto(
      "/portal/administration/organization-settings?tab=nonsense",
    );
    await expect(page.getByRole("tab", { name: "General" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  // #990 and #992 in one URL: the old route with a tab that has since left the
  // page. Both halves have to land, or a bookmark for Page visibility comes
  // back on General with nothing to say it moved.
  test("the old route redirects, and a moved tab lands on its new page", async ({
    page,
  }) => {
    await page.goto("/portal/administration/system-settings?tab=notifications");
    await expect(page).toHaveURL(
      /\/portal\/administration\/organization-settings\?tab=notifications$/,
    );
    await expect(
      page.getByRole("tab", { name: "Notifications" }),
    ).toHaveAttribute("aria-selected", "true");

    for (const [tab, path] of [
      ["layout", "/portal/website/page-layout"],
      ["visibility", "/portal/website/page-visibility"],
      ["legal", "/portal/website/legal-documents"],
    ] as const) {
      await page.goto(`/portal/administration/system-settings?tab=${tab}`);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
  });

  // app_settings rows are a global singleton -- unlike every other fixture in
  // these specs there's no per-test copy to mutate, so two Playwright
  // projects running this concurrently against the one Supabase instance
  // would overwrite each other's value between the save and the reload.
  // Pinned to a single project (still covered on every PR, since the PR
  // suite runs chromium) and restored afterwards.
  test("saves an approval threshold and persists it", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "Mutates a global app_settings row; see comment above.",
    );

    const admin = createAdminClient();
    const { data: original } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", EXPENSE_THRESHOLD_KEY)
      .maybeSingle();

    try {
      await page.goto("/portal/administration/organization-settings");
      await page.getByRole("tab", { name: "Workflow settings" }).click();

      // `has:` is matched relative to each candidate form, so its locator
      // stays page-rooted; scoping the forms themselves is what keeps the
      // streamed copy of the page out (see portalMain).
      const expenseForm = portalMain(page)
        .locator("form")
        .filter({ has: page.locator("#expense-threshold") });
      await expenseForm.locator("#expense-threshold").fill("321.5");
      await expenseForm.getByRole("button", { name: "Save" }).click();

      // Saves confirm with a toast at the page root, not an inline alert
      // in the form.
      await expect(
        page.getByRole("region", { name: "Notifications" }),
      ).toContainText("Expense approval threshold updated.");

      // The tab is in the URL since #947, so the reload comes back to it
      // rather than dropping to General.
      await page.reload();
      await expect(
        page.getByRole("tab", { name: "Workflow settings" }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(portalMain(page).locator("#expense-threshold")).toHaveValue(
        "321.5",
      );
    } finally {
      if (original) {
        await admin
          .from("app_settings")
          .update({ value: original.value })
          .eq("key", EXPENSE_THRESHOLD_KEY);
      } else {
        await admin
          .from("app_settings")
          .delete()
          .eq("key", EXPENSE_THRESHOLD_KEY);
      }
    }
  });
});

// Outside the block above on purpose: that one signs in as admin in
// beforeEach, and a second sign-in on the same page would not find the login
// form.
test.describe("organization settings for a board member", () => {
  // Organization Settings is the board's only Administration page -- they hold
  // system_settings:manage and nothing else in the section -- and no panel is
  // gated below the layout, so a deep link into one has to work for them too.
  test("a board member can deep-link into a tab", async ({ page }) => {
    await signIn(page, { email: "board@example.test" });
    await page.goto(
      "/portal/administration/organization-settings?tab=notifications",
    );

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Organization Settings",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Notifications" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  // The acceptance criterion #990 set, end to end: the board reaches the pages
  // that moved to Website without holding any site_content, and the CMS the
  // widened gate deliberately did not give them stays shut.
  test("a board member reaches the moved settings but not the CMS", async ({
    page,
  }) => {
    await signIn(page, { email: "board@example.test" });

    for (const [path, heading] of [
      ["/portal/website/page-visibility", "Page visibility"],
      ["/portal/website/legal-documents", "Legal documents"],
      ["/portal/website/page-layout", "Layout"],
    ] as const) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { level: 1, name: heading, exact: true }),
      ).toBeVisible();
    }

    // Pages and Articles are site_content, which the board does not hold.
    await page.goto("/portal/website");
    await expect(page).toHaveURL(/\/portal\/home\?denied=/);
  });
});
