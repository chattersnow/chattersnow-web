// Issue #687: conduct report intake and case tracking.
//
// What is worth driving a browser for is the access rule, because it is the
// half of this feature that no unit test can reach and the half the ticket
// puts first: a board member sees nothing until they are assigned, sees
// exactly the case they were assigned once they are, and loses it again the
// moment they step back. The intake path is driven alongside it because the
// case has to exist for any of that to mean anything.
//
// Everything here is scoped to a report this spec creates, so the chromium and
// mobile-chromium projects -- which test:e2e:pr runs fully in parallel against
// one Supabase instance -- never assert on each other's rows. The seeded cases
// are left alone.
import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { modal } from "./helpers/dialog";
import { SEEDED_USER_IDS } from "../test/seed-fixtures";

const BOARD = "board@example.test";

test.describe("conduct reports", () => {
  test("records a report, acknowledges it and assigns a reviewer", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const marker = `E2E conduct ${crypto.randomUUID().slice(0, 8)}`;
    let reference: string | null = null;

    try {
      await signIn(page);

      await page.goto("/portal/conduct");
      await expect(
        page.getByRole("heading", { level: 1, name: "Conduct" }),
      ).toBeVisible();

      await page.getByRole("button", { name: "New report" }).click();
      const dialog = modal(page);
      await dialog.getByLabel("What was reported").fill(marker);
      await dialog.getByRole("button", { name: "Record report" }).click();

      // Recording a report lands on its own case, because acknowledging it and
      // assigning reviewers is the next thing intake does.
      await expect(dialog).not.toBeVisible();
      const heading = page.getByRole("heading", { level: 1, name: /^CR-/ });
      await expect(heading).toBeVisible();
      reference = (await heading.innerText()).trim();
      await expect(page.getByText(marker)).toBeVisible();

      // The clock: the seed configures a five-day acknowledgement commitment,
      // so a report received today is due rather than unmeasured.
      await expect(page.getByText(/Acknowledge in \d+ days/)).toBeVisible();

      await page
        .getByRole("button", { name: "Record acknowledgement" })
        .click();
      await expect(page.getByText(/^Acknowledged: \d{4}-/)).toBeVisible();

      // Only accounts that hold the resource are offered, which is what makes
      // an assignment mean something: the database refuses one to anybody who
      // could not then read the case.
      await page
        .getByLabel("Assign somebody")
        .selectOption({ label: "Taylor Brooks" });
      await page.getByRole("button", { name: "Assign", exact: true }).click();

      // The count against the organization's own minimum is what moves, and
      // asserting on it proves the assignment landed rather than that the
      // select still shows what was picked.
      await expect(page.getByText(/1 short of the 2/)).toBeVisible();
    } finally {
      if (reference) {
        await admin.from("conduct_reports").delete().eq("reference", reference);
      }
    }
  });

  // The rule the ticket puts first, and the one no unit test can reach:
  // assignment is the access grant, and recusal takes it away.
  test("an assigned board member sees the case, and loses it on recusing", async ({
    page,
  }) => {
    const admin = createAdminClient();
    const marker = `E2E assigned ${crypto.randomUUID().slice(0, 8)}`;
    let reportId: string | null = null;

    try {
      const { data: report, error } = await admin
        .from("conduct_reports")
        .insert({
          received_on: new Date().toISOString().slice(0, 10),
          channel: "email",
          reporter_kind: "anonymous",
          summary: marker,
        })
        .select("id, reference")
        .single();
      if (error) throw error;
      reportId = report.id as string;

      await admin.from("conduct_report_reviewers").insert({
        report_id: reportId,
        stage: "review",
        user_id: SEEDED_USER_IDS.board,
      });

      await signIn(page, { email: BOARD });
      await page.goto("/portal/conduct");

      const link = page.getByRole("link", { name: report.reference as string });
      await expect(link).toBeVisible();
      await link.click();
      await expect(page.getByText(marker)).toBeVisible();

      await page
        .getByLabel("Step back from this case")
        .fill("I know the person named in this report.");
      await page.getByRole("button", { name: "Recuse myself" }).click();

      await expect(page).toHaveURL(/\/portal\/conduct$/);
      await expect(
        page.getByRole("link", { name: report.reference as string }),
      ).toHaveCount(0);
    } finally {
      if (reportId) {
        await admin.from("conduct_reports").delete().eq("id", reportId);
      }
    }
  });

  test("a board member with no assignment sees an empty queue rather than a locked door", async ({
    page,
  }) => {
    await signIn(page, { email: BOARD });
    await page.goto("/portal/conduct");

    // The page opens -- the grant is what the route asks for -- and shows
    // nothing, which is the intended state and says so.
    await expect(
      page.getByRole("heading", { level: 1, name: "Conduct" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "New report" })).toHaveCount(
      0,
    );
  });

  // The one thing in this feature that reaches outside its own section: a
  // five-day clock is only a clock if something says so where people look.
  // The seed leaves one report unacknowledged and past the commitment.
  test("an overdue acknowledgement reaches the attention menu", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/portal/home");

    await page.getByRole("button", { name: /items needing attention/ }).click();
    await expect(
      page.getByRole("menuitem", {
        name: /conduct report.* past acknowledgement/,
      }),
    ).toBeVisible();
  });

  test("a coordinator has no Conduct section at all", async ({ page }) => {
    await signIn(page, { email: "coordinator@example.test" });

    await page.goto("/portal/home");
    await expect(
      page.getByRole("link", { name: "Conduct", exact: true }),
    ).toHaveCount(0);

    await page.goto("/portal/conduct");
    await expect(page).toHaveURL(/denied=/);
  });
});
