// Integration test: exercises the real event logistics Server Actions against
// a real local Supabase stack (checkPermission, then real `event_logistics`
// RLS). `event_logistics` is gated on the shared `events` resource -- select
// on events:view, writes on events:manage (20260822100000) -- and holds the
// emergency-contact details, so the view-only roles (finance, volunteer)
// reading but never writing it is the case worth pinning down.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  createPublishedEvent,
  signInAs,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { getEventLogisticsAction, upsertEventLogisticsAction } =
  await import("./logistics-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function logisticsForm(overrides: { meetingPoint?: string } = {}) {
  const fd = new FormData();
  fd.set("meetingPoint", overrides.meetingPoint ?? "Base lodge, north doors");
  fd.set("gearRequirements", "Helmet and goggles required");
  fd.set("transportation", "Charter bus from the community center");
  fd.set("emergencyContactName", "Integration Test Contact");
  fd.set("emergencyContactPhone", "555-0199");
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

async function seedLogistics(eventId: string) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await upsertEventLogisticsAction(eventId, logisticsForm());
  if ("error" in result) throw new Error(result.error);
}

describe("event logistics actions (integration)", () => {
  test("requires a signed-in user to save logistics", async () => {
    const event = await createPublishedEvent();
    currentSupabase = anonClient();

    expect(await upsertEventLogisticsAction(event.id, logisticsForm())).toEqual(
      { error: "You must be signed in to update logistics." },
    );

    await event.cleanup();
  });

  test("admin role (events manage) can save and re-save logistics", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await upsertEventLogisticsAction(event.id, logisticsForm())).toEqual(
      { success: true },
    );

    const loaded = await getEventLogisticsAction(event.id);
    if (!("data" in loaded) || !loaded.data) throw new Error("expected data");
    expect(loaded.data.meeting_point).toBe("Base lodge, north doors");

    // Second call takes the on-conflict update path, which is a separate RLS
    // policy from the insert one.
    expect(
      await upsertEventLogisticsAction(
        event.id,
        logisticsForm({ meetingPoint: "Ticket window" }),
      ),
    ).toEqual({ success: true });

    const updated = await getEventLogisticsAction(event.id);
    if (!("data" in updated) || !updated.data) throw new Error("expected data");
    expect(updated.data.meeting_point).toBe("Ticket window");

    await event.cleanup();
  });

  test("returns null rather than an error for an event with no logistics row", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await getEventLogisticsAction(event.id)).toEqual({ data: null });

    await event.cleanup();
  });

  test("event_coordinator role (events manage) can save logistics", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(await upsertEventLogisticsAction(event.id, logisticsForm())).toEqual(
      { success: true },
    );

    await event.cleanup();
  });

  test("finance role (events view only) can read but not save logistics", async () => {
    const event = await createPublishedEvent();
    await seedLogistics(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    const loaded = await getEventLogisticsAction(event.id);
    if (!("data" in loaded) || !loaded.data) throw new Error("expected data");
    expect(loaded.data.emergency_contact_name).toBe("Integration Test Contact");

    expect(await upsertEventLogisticsAction(event.id, logisticsForm())).toEqual(
      DENIED,
    );

    await event.cleanup();
  });

  test("volunteer role (events view only) can read but not save logistics", async () => {
    const event = await createPublishedEvent();
    await seedLogistics(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    const loaded = await getEventLogisticsAction(event.id);
    if (!("data" in loaded) || !loaded.data) throw new Error("expected data");
    expect(loaded.data.meeting_point).toBe("Base lodge, north doors");

    expect(await upsertEventLogisticsAction(event.id, logisticsForm())).toEqual(
      DENIED,
    );

    await event.cleanup();
  });

  test("board role (no events access) can neither read nor save logistics", async () => {
    const event = await createPublishedEvent();
    await seedLogistics(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await getEventLogisticsAction(event.id)).toEqual(DENIED);
    expect(await upsertEventLogisticsAction(event.id, logisticsForm())).toEqual(
      DENIED,
    );

    await event.cleanup();
  });

  test("a deactivated (former) account cannot save logistics", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.former);

    expect(await upsertEventLogisticsAction(event.id, logisticsForm())).toEqual(
      DENIED,
    );

    await event.cleanup();
  });
});
