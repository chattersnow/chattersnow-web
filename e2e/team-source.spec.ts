// Issue #1014: Meet the Team can list the people from People instead of the
// copy in Site Content. Which source it uses is one `layout.team_source` row
// shared by the whole site, and the listings are rows the rest of the suite's
// /about/team reads would see, so this file mutates global state and lives in
// the `mutating` project -- see playwright.config.ts.
import { test, expect } from "./helpers/test";
import { createAdminClient } from "./helpers/admin-client";

/** The three people supabase/seed.sql lists, and how it lists them. */
const SEEDED = [
  {
    email: "jamie.rivera@example.test",
    name: "Jamie Rivera",
    role: "Programs lead",
    bio: "Jamie has run the winter access program since it began, and learned to ride as an adult.\n\nOff snow you will find them at the climbing gym or organizing the gear library.",
    sortOrder: 1,
  },
  {
    email: "alex.chen@example.test",
    name: "Alex Chen",
    role: "Board chair",
    bio: null,
    sortOrder: 2,
  },
  {
    email: "priya.n@example.test",
    name: "Priya Natarajan",
    role: null,
    bio: null,
    sortOrder: null,
  },
];

async function setSource(source: "content" | "people") {
  const admin = createAdminClient();
  const { error } = await admin
    .from("app_settings")
    .upsert(
      { key: "layout.team_source", value: source },
      { onConflict: "tenant_id,key" },
    );
  if (error) {
    throw new Error(`Could not set layout.team_source: ${error.message}`);
  }
}

async function unlistAll() {
  const admin = createAdminClient();
  const { error } = await admin
    .from("public_team_members")
    .delete()
    .not("id", "is", null);
  if (error) throw new Error(`Could not unlist: ${error.message}`);
}

async function restoreSeededListings() {
  const admin = createAdminClient();
  await unlistAll();
  for (const person of SEEDED) {
    const { data, error: lookup } = await admin
      .from("people")
      .select("id")
      .eq("email", person.email)
      .single();
    if (lookup || !data) {
      throw new Error(`Could not find ${person.name}: ${lookup?.message}`);
    }
    const { error } = await admin.from("public_team_members").insert({
      person_id: data.id,
      public_role: person.role,
      bio: person.bio,
      sort_order: person.sortOrder,
    });
    if (error) {
      throw new Error(`Could not relist ${person.name}: ${error.message}`);
    }
  }
}

test.describe("where Meet the Team gets its members", () => {
  // Both the setting and the listings are site-wide, so one case's cleanup
  // would otherwise race another's assertions. Same reasoning as
  // programs-source.spec.ts.
  test.describe.configure({ mode: "serial" });

  test.afterEach(async () => {
    await setSource("content");
    await restoreSeededListings();
  });

  test("Site Content is the default, and renders the copy", async ({
    page,
  }) => {
    await setSource("content");
    await page.goto("/about/team");

    await expect(
      page.getByRole("heading", { level: 1, name: "Meet the team" }),
    ).toBeVisible();
    // The seed writes no about_team.members row, so the copy is the registry
    // default. The people are listed in the seed, so their absence here is
    // the assertion that the setting is what decides, not the data.
    await expect(page.getByText("Team member name")).toBeVisible();
    await expect(page.getByText("Jamie Rivera")).toHaveCount(0);
  });

  test("the listed people render in order, with their public fields", async ({
    page,
  }) => {
    await setSource("people");
    await page.goto("/about/team");

    await expect(page.getByText("Jamie Rivera")).toBeVisible();
    await expect(page.getByText("Programs lead")).toBeVisible();
    await expect(
      page.getByText("Off snow you will find them at the climbing gym", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.getByText("Alex Chen")).toBeVisible();
    await expect(page.getByText("Board chair")).toBeVisible();
    // The person with no biography gets the copy's placeholder, as a copy
    // row without one does.
    await expect(page.getByText("Bio coming soon.").first()).toBeVisible();
    // Anchored before the snapshot below is taken (#1294). Jamie and Alex are
    // each proven visible above; Priya was not, so a card that had not landed
    // yet gave `indexOf` a -1 and the ordering assertion failed on a page that
    // was merely still arriving.
    await expect(page.getByText("Priya Natarajan")).toBeVisible();
    // The unordered person sorts after the ordered ones. Read off the page
    // text rather than headings: the card grid names people in plain text.
    const text = await page.locator("main").innerText();
    expect(text.indexOf("Jamie Rivera")).toBeLessThan(
      text.indexOf("Alex Chen"),
    );
    expect(text.indexOf("Priya Natarajan")).toBeGreaterThan(
      text.indexOf("Alex Chen"),
    );
    await expect(page.getByText("Team member name")).toHaveCount(0);
  });

  test("a person taken off the page is not on the site", async ({ page }) => {
    await setSource("people");
    const admin = createAdminClient();
    const { data } = await admin
      .from("people")
      .select("id")
      .eq("email", "alex.chen@example.test")
      .single();
    await admin.from("public_team_members").delete().eq("person_id", data!.id);

    await page.goto("/about/team");
    await expect(page.getByText("Jamie Rivera")).toBeVisible();
    await expect(page.getByText("Alex Chen")).toHaveCount(0);
  });

  test("People mode with nobody listed shows the empty copy", async ({
    page,
  }) => {
    await setSource("people");
    await unlistAll();

    await page.goto("/about/team");
    await expect(
      page.getByRole("heading", { level: 1, name: "Meet the team" }),
    ).toBeVisible();
    await expect(
      page.getByText("We're updating this page. Check back soon."),
    ).toBeVisible();
    await expect(page.getByText("Team member name")).toHaveCount(0);
  });
});
