// Integration test: exercises the real createEventAction against a real
// local Supabase stack (checkPermission, then real `events` RLS). The
// `events` resource covers events plus sponsors/giveaways/logistics/
// volunteers, and had no role-based automated coverage before -- other
// integration tests only used `events` as an admin-created FK fixture.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  signIn,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { createEventAction, deleteEventAction, updateEventAction } =
  await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function eventForm(overrides?: { name?: string; programIds?: string[] }) {
  const fd = new FormData();
  fd.set(
    "name",
    overrides?.name ?? `Integration Test Event ${crypto.randomUUID()}`,
  );
  // A naive datetime-local value ("YYYY-MM-DDTHH:mm"), matching what the
  // event form's <input type="datetime-local"> submits -- parseEventForm
  // (since 355a8f7) parses it against the submitted timezone and rejects
  // full ISO strings with milliseconds/offset.
  fd.set(
    "startsAt",
    new Date(Date.now() + 86_400_000).toISOString().slice(0, 16),
  );
  fd.set("timezone", "America/Chicago");
  fd.set("visibility", "public");
  fd.set("status", "draft");
  for (const programId of overrides?.programIds ?? []) {
    fd.append("programIds", programId);
  }
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

async function cleanupEvent(name: string) {
  await adminClient.from("events").delete().eq("name", name);
}

describe("createEventAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();
    const result = await createEventAction(eventForm());
    expect(result).toEqual({
      error: "You must be signed in to create an event.",
    });
  });

  test("admin role (events manage) can create an event", async () => {
    const name = `Integration Test Event ${crypto.randomUUID()}`;
    currentSupabase = await signIn(SEEDED_USERS.admin);
    const result = await createEventAction(eventForm({ name }));
    expect(result).toEqual({ success: true });
    await cleanupEvent(name);
  });

  test("event_coordinator role (events manage) can create an event", async () => {
    const name = `Integration Test Event ${crypto.randomUUID()}`;
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    const result = await createEventAction(eventForm({ name }));
    expect(result).toEqual({ success: true });
    await cleanupEvent(name);
  });

  test("finance role (events view only) cannot create an event", async () => {
    currentSupabase = await signIn(SEEDED_USERS.finance);
    const result = await createEventAction(eventForm());
    expect(result).toEqual(DENIED);
  });

  test("board role (no events access) cannot create an event", async () => {
    currentSupabase = await signIn(SEEDED_USERS.board);
    const result = await createEventAction(eventForm());
    expect(result).toEqual(DENIED);
  });

  test("volunteer role (events view only) cannot create an event", async () => {
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    const result = await createEventAction(eventForm());
    expect(result).toEqual(DENIED);
  });

  test("a deactivated (former) account cannot create an event", async () => {
    currentSupabase = await signIn(SEEDED_USERS.former);
    const result = await createEventAction(eventForm());
    expect(result).toEqual(DENIED);
  });
});

describe("deleteEventAction (integration)", () => {
  async function createEvent() {
    const { data, error } = await adminClient
      .from("events")
      .insert({
        name: `Integration Test Event ${crypto.randomUUID()}`,
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        timezone: "America/Chicago",
        visibility: "public",
        status: "draft",
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  async function eventExists(id: string) {
    const { data } = await adminClient
      .from("events")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    return data !== null;
  }

  test("requires a signed-in user", async () => {
    const id = await createEvent();
    currentSupabase = anonClient();
    expect(await deleteEventAction(id)).toEqual({
      error: "You must be signed in to delete an event.",
    });
    expect(await eventExists(id)).toBe(true);
    await adminClient.from("events").delete().eq("id", id);
  });

  test("event_coordinator role (events manage) can delete a bare event", async () => {
    const id = await createEvent();
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    expect(await deleteEventAction(id)).toEqual({ success: true });
    expect(await eventExists(id)).toBe(false);
  });

  test("records the delete in the audit log", async () => {
    const id = await createEvent();
    currentSupabase = await signIn(SEEDED_USERS.admin);
    expect(await deleteEventAction(id)).toEqual({ success: true });

    const { data } = await adminClient
      .from("audit_log")
      .select("action")
      .eq("table_name", "events")
      .eq("record_id", id);
    expect(data?.map((row) => row.action)).toContain("delete");
  });

  test("finance role (events view only) cannot delete an event", async () => {
    const id = await createEvent();
    currentSupabase = await signIn(SEEDED_USERS.finance);
    expect(await deleteEventAction(id)).toEqual(DENIED);
    expect(await eventExists(id)).toBe(true);
    await adminClient.from("events").delete().eq("id", id);
  });

  test("refuses an event with linked records, naming what's blocking", async () => {
    const id = await createEvent();
    const { error: codeError } = await adminClient
      .from("discount_codes")
      .insert({ event_id: id, code: `INT-${crypto.randomUUID().slice(0, 8)}` });
    if (codeError) throw codeError;

    currentSupabase = await signIn(SEEDED_USERS.admin);
    const result = await deleteEventAction(id);

    expect(result).toHaveProperty("error");
    const message = (result as { error: string }).error;
    expect(message).toContain("1 discount code");
    expect(message).toContain("Cancelled or Archived");
    // The refusal is a BEFORE trigger, so nothing cascaded either.
    expect(await eventExists(id)).toBe(true);

    await adminClient.from("discount_codes").delete().eq("event_id", id);
    await adminClient.from("events").delete().eq("id", id);
  });

  test("allows the delete once the linked records are gone", async () => {
    const id = await createEvent();
    await adminClient
      .from("discount_codes")
      .insert({ event_id: id, code: `INT-${crypto.randomUUID().slice(0, 8)}` });
    await adminClient.from("discount_codes").delete().eq("event_id", id);

    currentSupabase = await signIn(SEEDED_USERS.admin);
    expect(await deleteEventAction(id)).toEqual({ success: true });
    expect(await eventExists(id)).toBe(false);
  });
});

// An event can count toward more than one program's impact report, so the
// link is a join table rather than the single events.program_id it replaced.
// These exercise the real event_programs RLS as well as the sync itself.
describe("event program links (integration)", () => {
  async function createProgram() {
    const { data, error } = await adminClient
      .from("programs")
      .insert({ name: `Integration Test Program ${crypto.randomUUID()}` })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  async function linkedProgramIds(eventId: string) {
    const { data } = await adminClient
      .from("event_programs")
      .select("program_id")
      .eq("event_id", eventId);
    return (data ?? []).map((row) => row.program_id as string).sort();
  }

  async function eventIdByName(name: string) {
    const { data } = await adminClient
      .from("events")
      .select("id")
      .eq("name", name)
      .single();
    return data?.id as string;
  }

  test("creates an event linked to two programs at once", async () => {
    const [programA, programB] = [await createProgram(), await createProgram()];
    const name = `Integration Test Event ${crypto.randomUUID()}`;
    currentSupabase = await signIn(SEEDED_USERS.coordinator);

    expect(
      await createEventAction(
        eventForm({ name, programIds: [programA, programB] }),
      ),
    ).toEqual({ success: true });

    const eventId = await eventIdByName(name);
    expect(await linkedProgramIds(eventId)).toEqual(
      [programA, programB].sort(),
    );

    await cleanupEvent(name);
    await adminClient.from("programs").delete().in("id", [programA, programB]);
  });

  test("replaces the existing links rather than appending to them", async () => {
    const [programA, programB] = [await createProgram(), await createProgram()];
    const name = `Integration Test Event ${crypto.randomUUID()}`;
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    await createEventAction(eventForm({ name, programIds: [programA] }));
    const eventId = await eventIdByName(name);

    expect(
      await updateEventAction(
        eventId,
        eventForm({ name, programIds: [programB] }),
      ),
    ).toEqual({ success: true });
    expect(await linkedProgramIds(eventId)).toEqual([programB]);

    // ...and unchecking the last one leaves the event with no programs.
    expect(await updateEventAction(eventId, eventForm({ name }))).toEqual({
      success: true,
    });
    expect(await linkedProgramIds(eventId)).toEqual([]);

    await cleanupEvent(name);
    await adminClient.from("programs").delete().in("id", [programA, programB]);
  });

  test("finance role (events view only) cannot change the links", async () => {
    const programId = await createProgram();
    const name = `Integration Test Event ${crypto.randomUUID()}`;
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    await createEventAction(eventForm({ name, programIds: [programId] }));
    const eventId = await eventIdByName(name);

    currentSupabase = await signIn(SEEDED_USERS.finance);
    expect(await updateEventAction(eventId, eventForm({ name }))).toEqual(
      DENIED,
    );
    expect(await linkedProgramIds(eventId)).toEqual([programId]);

    await cleanupEvent(name);
    await adminClient.from("programs").delete().eq("id", programId);
  });

  test("deleting a program drops its links, not the events", async () => {
    const programId = await createProgram();
    const name = `Integration Test Event ${crypto.randomUUID()}`;
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    await createEventAction(eventForm({ name, programIds: [programId] }));
    const eventId = await eventIdByName(name);

    await adminClient.from("programs").delete().eq("id", programId);

    expect(await linkedProgramIds(eventId)).toEqual([]);
    const { data } = await adminClient
      .from("events")
      .select("id")
      .eq("id", eventId)
      .maybeSingle();
    expect(data).not.toBeNull();

    await cleanupEvent(name);
  });
});
