// Integration test: exercises the real createEventIncidentAction/
// listEventIncidentsAction/deleteEventIncidentAction against a real local
// Supabase stack (checkPermission, then real `event_incidents` RLS). Incident
// reports are the most narrowly-scoped resource in the permission matrix --
// only admin/event_coordinator get any access, everyone else (including
// finance and board) is 'none' -- and had no automated coverage before.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  createPublishedEvent,
  signIn,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  createEventIncidentAction,
  listEventIncidentsAction,
  deleteEventIncidentAction,
} = await import("./incidents-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function incidentForm() {
  const fd = new FormData();
  fd.set("description", "Minor slip on the ice near the entrance.");
  fd.set("severity", "minor");
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

describe("createEventIncidentAction / listEventIncidentsAction (integration)", () => {
  test("requires a signed-in user to create an incident", async () => {
    const event = await createPublishedEvent();
    currentSupabase = anonClient();
    const result = await createEventIncidentAction(event.id, incidentForm());
    expect(result).toEqual({
      error: "You must be signed in to log an incident.",
    });
    await event.cleanup();
  });

  test("admin role (event_incidents manage) can create, list, and delete an incident", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signIn(SEEDED_USERS.admin);

    const created = await createEventIncidentAction(event.id, incidentForm());
    expect(created).toEqual({ success: true });

    const listed = await listEventIncidentsAction(event.id);
    expect("data" in listed).toBe(true);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(1);

    const deleted = await deleteEventIncidentAction(listed.data[0].id);
    expect(deleted).toEqual({ success: true });

    await event.cleanup();
  });

  test("event_coordinator role (event_incidents manage) can create an incident", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    const result = await createEventIncidentAction(event.id, incidentForm());
    expect(result).toEqual({ success: true });
    await event.cleanup();
  });

  test("finance role (no event_incidents access) cannot create or list incidents", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signIn(SEEDED_USERS.finance);
    expect(await createEventIncidentAction(event.id, incidentForm())).toEqual(
      DENIED,
    );
    expect(await listEventIncidentsAction(event.id)).toEqual(DENIED);
    await event.cleanup();
  });

  test("board role (no event_incidents access) cannot create or list incidents", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signIn(SEEDED_USERS.board);
    expect(await createEventIncidentAction(event.id, incidentForm())).toEqual(
      DENIED,
    );
    expect(await listEventIncidentsAction(event.id)).toEqual(DENIED);
    await event.cleanup();
  });

  test("volunteer role (no event_incidents access) cannot create or list incidents", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    expect(await createEventIncidentAction(event.id, incidentForm())).toEqual(
      DENIED,
    );
    expect(await listEventIncidentsAction(event.id)).toEqual(DENIED);
    await event.cleanup();
  });

  test("a deactivated (former) account cannot create an incident", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signIn(SEEDED_USERS.former);
    const result = await createEventIncidentAction(event.id, incidentForm());
    expect(result).toEqual(DENIED);
    await event.cleanup();
  });
});
