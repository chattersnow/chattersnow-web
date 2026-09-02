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

const { createEventAction } = await import("./actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function eventForm(overrides?: { name?: string }) {
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
