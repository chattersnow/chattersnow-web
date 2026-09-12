// Issue #898: the Programs page can list the programs from the Programs module
// instead of the copy in Site Content. Which source it uses is one
// `layout.programs_source` row shared by the whole site, and publication is a
// column on rows the rest of the suite reads, so this file mutates global
// state and lives in the `mutating` project -- see playwright.config.ts.
import { test, expect } from "./helpers/test";
import { createAdminClient } from "./helpers/admin-client";

/** The three programs supabase/seed.sql publishes, and how it publishes them. */
const SEEDED_PUBLIC = [
  { name: "Winter Access Program", pillar: "Access", sortOrder: 1 },
  { name: "Youth Outdoor Mentorship", pillar: "Community", sortOrder: 2 },
  { name: "Community Gear Library", pillar: null, sortOrder: null },
];

async function setSource(source: "content" | "module") {
  const admin = createAdminClient();
  const { error } = await admin
    .from("app_settings")
    .upsert(
      { key: "layout.programs_source", value: source },
      { onConflict: "tenant_id,key" },
    );
  if (error) {
    throw new Error(`Could not set layout.programs_source: ${error.message}`);
  }
}

async function unpublishAll() {
  const admin = createAdminClient();
  const { error } = await admin
    .from("programs")
    .update({ is_public: false })
    .eq("is_public", true);
  if (error) throw new Error(`Could not unpublish: ${error.message}`);
}

async function restoreSeededPublication() {
  const admin = createAdminClient();
  await unpublishAll();
  for (const program of SEEDED_PUBLIC) {
    const { error } = await admin
      .from("programs")
      .update({
        is_public: true,
        pillar: program.pillar,
        sort_order: program.sortOrder,
      })
      .eq("name", program.name);
    if (error) {
      throw new Error(`Could not republish ${program.name}: ${error.message}`);
    }
  }
}

test.describe("where the Programs page gets its programs", () => {
  // Both the setting and `programs.is_public` are site-wide, so one case's
  // cleanup would otherwise race another's assertions. Same reasoning as
  // page-visibility.spec.ts.
  test.describe.configure({ mode: "serial" });

  test.afterEach(async () => {
    await setSource("content");
    await restoreSeededPublication();
  });

  test("Site Content is the default, and renders the copy", async ({
    page,
  }) => {
    await setSource("content");
    await page.goto("/programs");

    await expect(
      page.getByRole("heading", { level: 2, name: "Access" }),
    ).toBeVisible();
    await expect(page.getByText("Sample access program")).toBeVisible();
    // The module's programs are published in the seed, so their absence here
    // is the assertion that the setting is what decides, not the data.
    await expect(page.getByText("Winter Access Program")).toHaveCount(0);
  });

  test("the module's programs render under the pillars from Site Content", async ({
    page,
  }) => {
    await setSource("module");
    await page.goto("/programs");

    // The pillar headings stay copy in both modes.
    await expect(
      page.getByRole("heading", { level: 2, name: "Access" }),
    ).toBeVisible();
    await expect(page.getByText("Winter Access Program")).toBeVisible();
    await expect(page.getByText("Youth Outdoor Mentorship")).toBeVisible();
    await expect(page.getByText("Sample access program")).toHaveCount(0);

    // A program whose pillar matches no heading is still listed, rather than
    // disappearing between the two sources.
    await expect(page.getByText("Community Gear Library")).toBeVisible();
  });

  test("a program not marked public is not on the site", async ({ page }) => {
    await setSource("module");
    await unpublishAll();
    const admin = createAdminClient();
    await admin
      .from("programs")
      .update({ is_public: true, pillar: "Access" })
      .eq("name", "Winter Access Program");

    await page.goto("/programs");
    await expect(page.getByText("Winter Access Program")).toBeVisible();
    await expect(page.getByText("Youth Outdoor Mentorship")).toHaveCount(0);
  });

  test("module mode with nothing published shows the empty copy", async ({
    page,
  }) => {
    await setSource("module");
    await unpublishAll();

    await page.goto("/programs");
    await expect(
      page.getByRole("heading", { level: 1, name: "Programs" }),
    ).toBeVisible();
    await expect(
      page.getByText("Programs are being finalized. Check back soon."),
    ).toBeVisible();
    // Not a page of bare pillar headings over nothing.
    await expect(
      page.getByRole("heading", { level: 2, name: "Access" }),
    ).toHaveCount(0);
  });
});
