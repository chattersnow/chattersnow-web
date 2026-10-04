// Issue #1511: an event's full registrant list is a page of its own,
// /portal/events/[eventId]/registrants, instead of the "View all" sheet.
//
// The fixture mirrors the production event that prompted it -- twenty-odd
// registrations, three options, four questions -- with names and emails at
// the lengths real ones reach (40+ characters), because the seed's short
// values are exactly what let the sheet's sideways scroll ship unnoticed.
import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { modal } from "./helpers/dialog";
import type { Page } from "@playwright/test";

const REGISTRATIONS = 22;

async function seedFixture(admin: ReturnType<typeof createAdminClient>) {
  const suffix = crypto.randomUUID().slice(0, 8);
  // The seeded admin account (supabase/seed.sql). events.created_by defaults
  // to auth.uid(), which is null over the service-role client.
  const adminUserId = "aaaaaaaa-0000-4000-8000-000000000001";

  const { data: event, error: eventError } = await admin
    .from("events")
    .insert({
      name: `E2E Registrants ${suffix} — Saturday Night Ride, Lift & Lesson`,
      starts_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      timezone: "America/New_York",
      status: "published",
      visibility: "private",
      capacity: 60,
      registration_enabled: true,
      // Without a prompt the event asks no option question, and the
      // portal shows no option totals at all.
      registration_options_prompt: "Do you need a ticket or gear?",
      created_by: adminUserId,
    })
    .select("id, name")
    .single();
  if (eventError) throw eventError;

  const { data: options, error: optionsError } = await admin
    .from("event_registration_options")
    .insert([
      { event_id: event.id, label: "Need a ticket", cap: 25, sort_order: 1 },
      {
        event_id: event.id,
        label: "Need ticket and gear",
        cap: 10,
        sort_order: 2,
      },
      {
        event_id: event.id,
        label: "Don't need a ticket or gear.",
        cap: null,
        sort_order: 3,
      },
    ])
    .select("id, label, sort_order");
  if (optionsError) throw optionsError;

  const prompts = [
    "Carpool to this event?",
    "How many open seats do you have?",
    "Which borough/city are you coming from/leaving from?",
    "Anything else the organizers should know before the day?",
  ];
  const { data: questions, error: questionsError } = await admin
    .from("event_registration_questions")
    .insert(
      prompts.map((prompt, index) => ({
        event_id: event.id,
        kind: "short_text",
        prompt,
        sort_order: index + 1,
      })),
    )
    .select("id, prompt, sort_order");
  if (questionsError) throw questionsError;

  const { data: registrations, error: registrationsError } = await admin
    .from("event_registrations")
    .insert(
      Array.from({ length: REGISTRATIONS }, (_, index) => ({
        event_id: event.id,
        name: `Maximiliano Rodríguez-Castellanos ${index + 1}`,
        email: `maximiliano.rodriguez.castellanos.${index + 1}@protonmail.com`,
        phone: "(347) 555-0119",
        party_size: 1 + (index % 3),
      })),
    )
    .select("id");
  if (registrationsError) throw registrationsError;

  const { error: countsError } = await admin
    .from("event_registration_option_counts")
    .insert(
      registrations.map((registration, index) => {
        const option = options[index % options.length];
        return {
          registration_id: registration.id,
          option_id: option.id,
          label: option.label,
          sort_order: option.sort_order,
          quantity: 1,
        };
      }),
    );
  if (countsError) throw countsError;

  const { error: answersError } = await admin
    .from("event_registration_answers")
    .insert(
      registrations.flatMap((registration) =>
        questions.map((question) => ({
          registration_id: registration.id,
          question_id: question.id,
          kind: "short_text",
          prompt_as_shown: question.prompt,
          sort_order: question.sort_order,
          value: "Staten Island (St. George ferry terminal)",
          answer_text: "Staten Island (St. George ferry terminal)",
        })),
      ),
    );
  if (answersError) throw answersError;

  return {
    eventId: event.id as string,
    eventName: event.name as string,
    firstRegistrationId: registrations[0].id as string,
    async cleanup() {
      await admin.from("events").delete().eq("id", event.id);
    },
  };
}

/** The reader never has to scroll sideways to see the page. */
async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("event registrants page", () => {
  let fixture: Awaited<ReturnType<typeof seedFixture>>;

  test.beforeEach(async ({ page }) => {
    fixture = await seedFixture(createAdminClient());
    await signIn(page);
  });

  test.afterEach(async () => {
    await fixture?.cleanup();
  });

  test("fits a desk without a sideways table scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/portal/events/${fixture.eventId}/registrants`);
    await expect(
      page.getByRole("heading", { name: "Registrants", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Maximiliano Rodríguez-Castellanos 1",
        exact: true,
      }),
    ).toBeVisible();

    await expectNoSidewaysScroll(page);
    const table = page.locator('[data-slot="table-container"]').first();
    const tableOverflow = await table.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    );
    expect(tableOverflow).toBeLessThanOrEqual(0);

    await expect(
      page.getByRole("navigation", { name: "Breadcrumb" }),
    ).toContainText("Registrants");
  });

  test("fits a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/portal/events/${fixture.eventId}/registrants`);
    await expect(
      page.getByRole("button", {
        name: "Maximiliano Rodríguez-Castellanos 1",
        exact: true,
      }),
    ).toBeVisible();
    await expectNoSidewaysScroll(page);
  });

  test("the event's card links here, and the breadcrumb goes back", async ({
    page,
  }) => {
    await page.goto(`/portal/events/${fixture.eventId}?tab=registrants`);
    await page
      .getByRole("link", { name: `View all ${REGISTRATIONS} registrants` })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/portal/events/${fixture.eventId}/registrants$`),
    );

    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: fixture.eventName })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/portal/events/${fixture.eventId}\\?tab=registrants$`),
    );
  });

  test("search, filters, sort, page and the open registration survive a reload", async ({
    page,
  }) => {
    await page.goto(`/portal/events/${fixture.eventId}/registrants`);
    await page
      .getByRole("searchbox", { name: "Search registrants" })
      .fill("castellanos");
    await page.getByRole("button", { name: /Need ticket and gear/ }).click();
    await page.getByRole("button", { name: "Name, not sorted" }).click();
    await expect(page).toHaveURL(/q=castellanos/);
    await expect(page).toHaveURL(/option=/);
    await expect(page).toHaveURL(/sort=name/);

    await page.reload();
    await expect(
      page.getByRole("searchbox", { name: "Search registrants" }),
    ).toHaveValue("castellanos");
    await expect(
      page.getByRole("button", { name: /Need ticket and gear/, pressed: true }),
    ).toBeVisible();

    await page.goto(
      `/portal/events/${fixture.eventId}/registrants?perPage=10&page=2&registrant=${fixture.firstRegistrationId}`,
    );
    await expect(modal(page)).toBeVisible();
    await page.keyboard.press("Escape");
    // Rows 11-20 of 22: the second page at ten a page.
    await expect(page.locator("tbody tr")).toHaveCount(10);
  });
});
