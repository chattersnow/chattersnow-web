// Integration test: exercises the real createVolunteerHoursAction/
// updateVolunteerHoursAction/deleteVolunteerHoursAction/
// listVolunteerHoursAction against a real local Supabase stack
// (checkUser/checkAnyPermission or checkPermission, then real
// `volunteer_hours` RLS). This is the standalone org-wide ledger -- distinct
// from the per-event `event_volunteer_hours` table. Per §5.3/the table's own
// migration comment: insert allows `volunteers:manage` (admin) OR
// `volunteer_hours_logging:manage` (a volunteer logging their own hours,
// same "log own hours" carve-out as people_intake), but select/update/delete
// all require `volunteers` at view/manage respectively -- so the volunteer
// role can log hours but not edit or remove any entry, including its own.
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
  createVolunteerHoursAction,
  updateVolunteerHoursAction,
  deleteVolunteerHoursAction,
  listVolunteerHoursAction,
} = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

function hoursForm(overrides: { hours?: string; loggedDate?: string } = {}) {
  const fd = new FormData();
  fd.set("hours", overrides.hours ?? "3");
  fd.set("loggedDate", overrides.loggedDate ?? "2026-08-01");
  fd.set("notes", "Ran the basecamp check-in table.");
  return fd;
}

async function seedHoursEntry(personId: string) {
  const { data, error } = await adminClient
    .from("volunteer_hours")
    .insert({ person_id: personId, hours: 2, logged_date: "2026-07-15" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function hoursEntry(id: string) {
  const { data, error } = await adminClient
    .from("volunteer_hours")
    .select("hours, notes")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

describe("createVolunteerHoursAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    const result = await createVolunteerHoursAction(
      crypto.randomUUID(),
      hoursForm(),
    );
    expect(result).toEqual({ error: "You must be signed in to log hours." });
  });

  test("admin role (volunteers manage) can log hours for another person", async () => {
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const result = await createVolunteerHoursAction(person.id, hoursForm());
    expect(result).toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/volunteers/participation",
    );

    await adminClient
      .from("volunteer_hours")
      .delete()
      .eq("person_id", person.id);
    await person.cleanup();
  });

  test("volunteer role (volunteer_hours_logging manage carve-out) can log hours", async () => {
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    const result = await createVolunteerHoursAction(person.id, hoursForm());
    expect(result).toEqual({ success: true });

    await adminClient
      .from("volunteer_hours")
      .delete()
      .eq("person_id", person.id);
    await person.cleanup();
  });

  test("event_coordinator role (volunteers view only, no logging carve-out) cannot log hours", async () => {
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    const result = await createVolunteerHoursAction(person.id, hoursForm());
    expect(result).toEqual(DENIED);

    await person.cleanup();
  });

  test("finance role (no volunteers or logging access) cannot log hours", async () => {
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    const result = await createVolunteerHoursAction(person.id, hoursForm());
    expect(result).toEqual(DENIED);

    await person.cleanup();
  });

  test("board role (no volunteers or logging access) cannot log hours", async () => {
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    const result = await createVolunteerHoursAction(person.id, hoursForm());
    expect(result).toEqual(DENIED);

    await person.cleanup();
  });

  test("a deactivated (former) account cannot log hours", async () => {
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.former);

    const result = await createVolunteerHoursAction(person.id, hoursForm());
    expect(result).toEqual(DENIED);

    await person.cleanup();
  });
});

describe("updateVolunteerHoursAction / deleteVolunteerHoursAction (integration)", () => {
  test("admin role (volunteers manage) can update and delete an entry", async () => {
    const person = await createPerson();
    const id = await seedHoursEntry(person.id);
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const updateResult = await updateVolunteerHoursAction(
      id,
      person.id,
      hoursForm({ hours: "5" }),
    );
    expect(updateResult).toEqual({ success: true });
    expect(await hoursEntry(id)).toMatchObject({
      notes: "Ran the basecamp check-in table.",
    });

    const deleteResult = await deleteVolunteerHoursAction(id);
    expect(deleteResult).toEqual({ success: true });
    expect(await hoursEntry(id)).toBeNull();

    await person.cleanup();
  });

  test("volunteer role (logging carve-out does not cover update/delete) cannot update or delete an entry", async () => {
    const person = await createPerson();
    const id = await seedHoursEntry(person.id);
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    expect(
      await updateVolunteerHoursAction(id, person.id, hoursForm()),
    ).toEqual(DENIED);
    expect(await deleteVolunteerHoursAction(id)).toEqual(DENIED);
    const unchanged = await hoursEntry(id);
    expect(Number(unchanged?.hours)).toBe(2);
    expect(unchanged?.notes).toBeNull();

    await adminClient.from("volunteer_hours").delete().eq("id", id);
    await person.cleanup();
  });
});

describe("listVolunteerHoursAction (integration)", () => {
  test("event_coordinator role (volunteers view) can list hours", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    const result = await listVolunteerHoursAction();
    expect("data" in result).toBe(true);
  });

  test("volunteer role (volunteers view) can list hours", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);
    const result = await listVolunteerHoursAction();
    expect("data" in result).toBe(true);
  });

  test("finance role (no volunteers access) cannot list hours", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.finance);
    const result = await listVolunteerHoursAction();
    expect(result).toEqual(DENIED);
  });

  test("board role (no volunteers access) cannot list hours", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.board);
    const result = await listVolunteerHoursAction();
    expect(result).toEqual(DENIED);
  });
});
