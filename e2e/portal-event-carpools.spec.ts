// Issue #1649: carpool cars on an event. Staff add a car with a driver,
// assign two registrants to it, and tick one of them paid; the registrants
// page then says where each one rides.
import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";
import { createAdminClient } from "./helpers/admin-client";
import { modal } from "./helpers/dialog";

async function seedFixture(admin: ReturnType<typeof createAdminClient>) {
  const suffix = crypto.randomUUID().slice(0, 8);
  // The seeded admin account (supabase/seed.sql). events.created_by defaults
  // to auth.uid(), which is null over the service-role client.
  const adminUserId = "aaaaaaaa-0000-4000-8000-000000000001";

  const { data: event, error: eventError } = await admin
    .from("events")
    .insert({
      name: `E2E Carpools ${suffix}`,
      starts_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      timezone: "America/New_York",
      status: "published",
      visibility: "private",
      registration_enabled: true,
      carpools_enabled: true,
      created_by: adminUserId,
    })
    .select("id, name")
    .single();
  if (eventError) throw eventError;

  const names = [
    "Dana Driver-Okonkwo",
    "Maximiliano Rodríguez-Castellanos",
    "Priya Venkataraman-Sullivan",
  ];
  const { error: registrationsError } = await admin
    .from("event_registrations")
    .insert(
      names.map((name, index) => ({
        event_id: event.id,
        name,
        email: `carpool.${suffix}.${index}@example.test`,
        party_size: index === 1 ? 2 : 1,
      })),
    );
  if (registrationsError) throw registrationsError;

  return {
    eventId: event.id as string,
    names,
    async cleanup() {
      await admin.from("events").delete().eq("id", event.id);
    },
  };
}

test.describe("event carpools", () => {
  let fixture: Awaited<ReturnType<typeof seedFixture>>;

  test.beforeEach(async ({ page }) => {
    fixture = await seedFixture(createAdminClient());
    await signIn(page);
  });

  test.afterEach(async () => {
    await fixture?.cleanup();
  });

  test("creates a car, assigns two registrants and ticks paid", async ({
    page,
  }) => {
    const [driver, rider, other] = fixture.names;
    await page.goto(`/portal/events/${fixture.eventId}/carpools`);
    await expect(
      page.getByRole("heading", { name: "Carpools", level: 1 }),
    ).toBeVisible();

    await page.getByRole("button", { name: "+ Add car" }).click();
    const dialog = modal(page);
    await dialog.getByLabel("Driver").click();
    await page.getByRole("option", { name: driver }).click();
    await dialog.getByLabel("Seats for passengers").fill("3");
    await dialog.getByRole("button", { name: "Add car" }).click();
    await expect(dialog).toBeHidden();

    const car = page.getByRole("group", { name: "Car 1" });
    await expect(page.getByText(`Driver: ${driver}`)).toBeVisible();

    for (const name of [rider, other]) {
      await page
        .getByRole("combobox", { name: `Add ${name} to a car` })
        .click();
      await page.getByRole("option", { name: /^Car 1/ }).click();
      await expect(
        page.getByRole("combobox", { name: `Move ${name}` }),
      ).toBeVisible();
    }
    // A party of two and one, in three seats.
    await expect(car.getByText("3 of 3 seats")).toBeVisible();
    await expect(page.getByText("Every registrant is in a car.")).toBeVisible();

    await car.getByRole("checkbox").first().click();
    await expect(car.getByText("1 of 2 paid")).toBeVisible();

    await page.goto(`/portal/events/${fixture.eventId}/registrants`);
    await expect(
      page.getByRole("cell", { name: "Car 1 · Driver" }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Car 1 · Passenger · Paid" }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Car 1 · Passenger", exact: true }),
    ).toBeVisible();
  });
});
