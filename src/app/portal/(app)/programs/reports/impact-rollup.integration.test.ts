// Integration test: exercises get_program_impact_rollup_data (20260901040000)
// against a real local Supabase stack.
//
// This suite exists because of the bug it now guards. The RPC reads
// `volunteer_hours where event_id = any(...)`, but the event editor's
// Volunteers tab used to write a parallel `event_volunteer_hours` table, so
// hours logged there never reached the Program Impact Report. Nothing caught
// it: impact-rollup.test.ts is a pure-function suite over hand-built fixtures,
// and no test ever called the RPC. The consolidation in 20260904010000 fixed
// the data; this is what stops the two drifting apart again -- it logs hours
// through the real Server Action and asserts they come back out of the RPC.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createPerson,
  createProgram,
  createPublishedEvent,
  signInAs,
} from "../../../../../../test/integration-setup";
import { computeProgramImpactRollup } from "./impact-rollup";

mock.module("next/cache", () => ({ revalidatePath: () => {} }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { createEventVolunteerHoursAction } =
  await import("../../events/volunteers-actions");

function hoursForm(hours: string) {
  const fd = new FormData();
  fd.set("hours", hours);
  fd.set("loggedDate", new Date().toISOString().slice(0, 10));
  fd.set("notes", "Ran the gear table");
  return fd;
}

describe("get_program_impact_rollup_data (integration)", () => {
  test("counts volunteer hours logged from the event editor's Volunteers tab", async () => {
    const program = await createProgram();
    const event = await createPublishedEvent();
    const person = await createPerson();

    const linked = await adminClient
      .from("events")
      .update({ program_id: program.id })
      .eq("id", event.id);
    if (linked.error) throw linked.error;

    const signup = await adminClient
      .from("event_volunteers")
      .insert({ event_id: event.id, person_id: person.id });
    if (signup.error) throw signup.error;

    currentSupabase = await signInAs(SEEDED_USERS.admin);

    // Baseline: a program whose event has no hours reports zero.
    const before = await adminClient.rpc("get_program_impact_rollup_data", {
      p_program_id: program.id,
    });
    if (before.error) throw before.error;
    expect(before.data.event_ids).toEqual([event.id]);
    expect(before.data.volunteer_hours).toEqual([]);

    expect(
      await createEventVolunteerHoursAction(
        event.id,
        person.id,
        hoursForm("4.5"),
      ),
    ).toEqual({ success: true });

    const after = await adminClient.rpc("get_program_impact_rollup_data", {
      p_program_id: program.id,
    });
    if (after.error) throw after.error;
    expect(after.data.volunteer_hours).toHaveLength(1);
    expect(after.data.volunteer_hours[0].event_id).toBe(event.id);

    // Through the same aggregation the report page uses, so a regression in
    // either the RPC or sumVolunteerHours fails here.
    const rollup = computeProgramImpactRollup({
      eventCount: after.data.event_ids.length,
      events: after.data.events,
      notes: after.data.impact_notes,
      distributedMovements: after.data.distributed_movements,
      volunteerHours: after.data.volunteer_hours,
      registrations: after.data.registrations,
      checkinCounts: after.data.checkin_counts,
      discountCodes: after.data.discount_codes,
      eventVolunteers: after.data.event_volunteers,
      volunteerHourPeople: after.data.volunteer_hour_people,
      beginnerAttendees: after.data.beginner_attendees,
      profiledAttendees: after.data.profiled_attendees,
    });
    expect(rollup.volunteerHours).toBe(4.5);
    // The same person signed up and logged hours, so they count once.
    expect(rollup.volunteerParticipants).toBe(1);

    await adminClient.from("volunteer_hours").delete().eq("event_id", event.id);
    await adminClient
      .from("event_volunteers")
      .delete()
      .eq("event_id", event.id);
    await event.cleanup();
    await person.cleanup();
    await program.cleanup();
  });
});
