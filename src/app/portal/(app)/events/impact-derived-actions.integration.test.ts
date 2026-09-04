// Integration test: exercises get_event_impact_derived_data (20260904030000)
// against a real local Supabase stack.
//
// The reason this needs a real stack rather than a pure-function suite: the RPC
// is `security definer` specifically so the board role -- which holds
// event_impact:view but events:none and people:none -- gets real numbers on the
// Impact card. Under plain RLS those same queries return zero rows and the card
// would quietly read "0 participants" for exactly the role that opens it to
// report. Only a real stack with real policies can catch a regression there.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createPerson,
  createPublishedEvent,
  signInAs,
} from "../../../../../test/integration-setup";

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { getEventImpactDerivedAction } =
  await import("./impact-derived-actions");

/** An event with one checked-in registrant, one volunteer and one assigned code. */
async function seedEvent() {
  const event = await createPublishedEvent();
  const person = await createPerson();
  const volunteer = await createPerson();

  const registration = await adminClient
    .from("event_registrations")
    .insert({
      event_id: event.id,
      name: "Checked In Rider",
      email: `rider-${event.id}@example.test`,
      person_id: person.id,
      checked_in_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (registration.error) throw registration.error;

  const signup = await adminClient
    .from("event_volunteers")
    .insert({ event_id: event.id, person_id: volunteer.id });
  if (signup.error) throw signup.error;

  const code = await adminClient.from("discount_codes").insert({
    event_id: event.id,
    code: `TEST-${event.id.slice(0, 8)}`,
    registration_id: registration.data.id,
    assigned_at: new Date().toISOString(),
  });
  if (code.error) throw code.error;

  return {
    event,
    person,
    volunteer,
    cleanup: async () => {
      await adminClient
        .from("discount_codes")
        .delete()
        .eq("event_id", event.id);
      await adminClient
        .from("event_volunteers")
        .delete()
        .eq("event_id", event.id);
      await adminClient
        .from("event_registrations")
        .delete()
        .eq("event_id", event.id);
      await event.cleanup();
      await person.cleanup();
      await volunteer.cleanup();
    },
  };
}

describe("get_event_impact_derived_data (integration)", () => {
  test("admin sees participation, volunteer and discount figures", async () => {
    const seeded = await seedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const result = await getEventImpactDerivedAction(seeded.event.id);
    if ("error" in result) throw new Error(result.error);

    expect(result.data.checkedIn).toBe(1);
    expect(result.data.participants).toBe(1); // no headcount typed, so check-ins
    expect(result.data.firstTimeParticipants).toBe(1);
    expect(result.data.recurringParticipants).toBe(0);
    expect(result.data.volunteerParticipants).toBe(1);
    expect(result.data.discountCodesAssigned).toBe(1);

    await seeded.cleanup();
  });

  test("a typed headcount wins over check-ins, which stay visible as reference", async () => {
    const seeded = await seedEvent();
    const updated = await adminClient
      .from("events")
      .update({ attendance_count: 40 })
      .eq("id", seeded.event.id);
    if (updated.error) throw updated.error;

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getEventImpactDerivedAction(seeded.event.id);
    if ("error" in result) throw new Error(result.error);

    expect(result.data.participants).toBe(40);
    expect(result.data.checkedIn).toBe(1);

    await seeded.cleanup();
  });

  test("finance and board see the same numbers as admin, not RLS-blanked zeros", async () => {
    const seeded = await seedEvent();

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const asAdmin = await getEventImpactDerivedAction(seeded.event.id);
    if ("error" in asAdmin) throw new Error(asAdmin.error);

    for (const user of [SEEDED_USERS.finance, SEEDED_USERS.board]) {
      currentSupabase = await signInAs(user);
      const result = await getEventImpactDerivedAction(seeded.event.id);
      if ("error" in result) throw new Error(result.error);
      expect(result.data).toEqual(asAdmin.data);
    }

    await seeded.cleanup();
  });

  test("a role with no events or impact access is refused", async () => {
    const seeded = await seedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);

    expect(await getEventImpactDerivedAction(seeded.event.id)).toEqual({
      error: "Could not load the computed figures. Please try again.",
    });

    await seeded.cleanup();
  });
});
