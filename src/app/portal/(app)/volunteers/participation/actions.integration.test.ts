// Integration test: exercises the real volunteer-hours Server Actions
// against a real local Supabase stack (checkUser/checkPermission/
// checkAnyPermission, then real `volunteer_hours` RLS). Since 20260904010000
// there is one hours ledger with two entry points -- this page and the event
// editor's Volunteers tab -- and this file covers the org-wide half: reads
// gate on volunteers:view, writes on volunteers:manage, and insert alone also
// accepts the volunteer_hours_logging:manage "log own hours" carve-out -- so a
// volunteer can log hours but not edit or delete an entry.
//
// The consolidated RLS also admits event_volunteer_hours:manage on rows where
// event_id is not null, but these actions deliberately keep the narrower
// volunteers:manage gate (see updateVolunteerHoursAction), so event_coordinator
// is still denied below. Every fixture here leaves event_id null, i.e. exactly
// the org-wide path the merge left untouched; the event-scoped branch is
// covered in events/volunteers-actions.integration.test.ts. A wrong key or
// level in any of these actions would not be caught anywhere else.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPerson,
  signInAs,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  listVolunteerHoursAction,
  createVolunteerHoursAction,
  updateVolunteerHoursAction,
  deleteVolunteerHoursAction,
  listEventOptionsAction,
} = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

function hoursForm(overrides: { hours?: string; notes?: string } = {}) {
  const fd = new FormData();
  fd.set("hours", overrides.hours ?? "2.5");
  fd.set("loggedDate", "2026-02-01");
  fd.set("notes", overrides.notes ?? "Integration test entry");
  return fd;
}

// A fresh person plus one hours entry logged against them, seeded directly
// as the admin session. volunteer_hours.person_id has no cascade, so the
// entry (and anything a test added for the same person) must go before the
// person does.
async function createHoursEntry() {
  const person = await createPerson();
  const { data, error } = await adminClient
    .from("volunteer_hours")
    .insert({
      person_id: person.id,
      hours: 2.5,
      logged_date: "2026-02-01",
      notes: "Integration test entry",
    })
    .select("id")
    .single();
  if (error) throw error;

  return {
    id: data.id as string,
    personId: person.id,
    async cleanup() {
      await adminClient
        .from("volunteer_hours")
        .delete()
        .eq("person_id", person.id);
      await person.cleanup();
    },
  };
}

async function hoursRow(id: string) {
  const { data, error } = await adminClient
    .from("volunteer_hours")
    .select("id, hours, notes")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

describe("volunteer hours actions (integration)", () => {
  test("requires a signed-in user for writes", async () => {
    currentSupabase = anonClient();

    expect(
      await createVolunteerHoursAction(crypto.randomUUID(), hoursForm()),
    ).toEqual({ error: "You must be signed in to log hours." });
    expect(
      await updateVolunteerHoursAction(
        crypto.randomUUID(),
        crypto.randomUUID(),
        hoursForm(),
      ),
    ).toEqual({
      error: "You must be signed in to update a logged hours entry.",
    });
    expect(await deleteVolunteerHoursAction(crypto.randomUUID())).toEqual({
      error: "You must be signed in to remove a logged hours entry.",
    });
  });

  test("admin role (volunteers manage) can log, update, and delete hours", async () => {
    const entry = await createHoursEntry();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createVolunteerHoursAction(entry.personId, hoursForm()),
    ).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/volunteers/participation",
    );

    expect(
      await updateVolunteerHoursAction(
        entry.id,
        entry.personId,
        hoursForm({ hours: "4", notes: "Updated by admin" }),
      ),
    ).toEqual({ success: true });
    expect(await hoursRow(entry.id)).toMatchObject({
      notes: "Updated by admin",
    });

    expect(await deleteVolunteerHoursAction(entry.id)).toEqual({
      success: true,
    });
    expect(await hoursRow(entry.id)).toBeNull();

    await entry.cleanup();
  });

  test("volunteer role can log hours via the volunteer_hours_logging carve-out", async () => {
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    expect(await createVolunteerHoursAction(person.id, hoursForm())).toEqual({
      success: true,
    });

    await adminClient
      .from("volunteer_hours")
      .delete()
      .eq("person_id", person.id);
    await person.cleanup();
  });

  test("volunteer role (carve-out covers insert only) cannot update or delete an entry", async () => {
    const entry = await createHoursEntry();
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    expect(
      await updateVolunteerHoursAction(
        entry.id,
        entry.personId,
        hoursForm({ notes: "Rewritten by volunteer" }),
      ),
    ).toEqual(DENIED);
    expect(await deleteVolunteerHoursAction(entry.id)).toEqual(DENIED);

    // The denied writes must not have landed: the actions refuse them, and
    // the volunteers:manage update/delete policies would too.
    expect(await hoursRow(entry.id)).toMatchObject({
      notes: "Integration test entry",
    });

    await entry.cleanup();
  });

  async function expectNoWriteAccess(email: string) {
    const entry = await createHoursEntry();
    currentSupabase = await signInAs(email);

    expect(
      await createVolunteerHoursAction(entry.personId, hoursForm()),
    ).toEqual(DENIED);
    expect(
      await updateVolunteerHoursAction(entry.id, entry.personId, hoursForm()),
    ).toEqual(DENIED);
    expect(await deleteVolunteerHoursAction(entry.id)).toEqual(DENIED);

    await entry.cleanup();
  }

  test("event_coordinator role (volunteers view, no logging grant) cannot write hours", async () => {
    await expectNoWriteAccess(SEEDED_USERS.coordinator);
  });

  test("finance role (no volunteers access) cannot write hours", async () => {
    await expectNoWriteAccess(SEEDED_USERS.finance);
  });

  test("a deactivated (former) account cannot write hours", async () => {
    await expectNoWriteAccess(SEEDED_USERS.former);
  });

  test("volunteer role (volunteers view) can list hours and event options", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    expect("data" in (await listVolunteerHoursAction())).toBe(true);
    expect("data" in (await listEventOptionsAction())).toBe(true);
  });

  test("finance role has events access but no volunteers access, so both lists deny", async () => {
    // Proves the actions gate on the volunteers key specifically:
    // finance holds events:view, which would pass a wrongly-keyed check in
    // listEventOptionsAction.
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    expect(await listVolunteerHoursAction()).toEqual(DENIED);
    expect(await listEventOptionsAction()).toEqual(DENIED);
  });

  test("a user with no role cannot list hours", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.noAccess);
    expect(await listVolunteerHoursAction()).toEqual(DENIED);
  });
});
