// Integration test: exercises the real event sponsor Server Actions against a
// real local Supabase stack (checkPermission, then real `event_sponsors`
// RLS). `event_sponsors` is gated on the shared `events` resource -- select
// on events:view, writes on events:manage (20260822100000) -- so the
// interesting cases are the view-only roles (finance, volunteer), which can
// read the sponsor list but must not be able to change it.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  createPerson,
  createPublishedEvent,
  signInAs,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  listEventSponsorsAction,
  createEventSponsorAction,
  updateEventSponsorAction,
  deleteEventSponsorAction,
} = await import("./sponsors-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function sponsorForm(overrides: { notes?: string } = {}) {
  const fd = new FormData();
  fd.set("supportType", "in_kind");
  fd.set("inKindDescription", "Donated 20 pairs of gloves");
  fd.set("contributionValue", "250");
  fd.set("isPublic", "on");
  fd.set("notes", overrides.notes ?? "Confirmed by phone");
  fd.set("followUpStatus", "in_progress");
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

describe("event sponsor actions (integration)", () => {
  test("requires a signed-in user to add a sponsor", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = anonClient();

    const result = await createEventSponsorAction(
      event.id,
      person.id,
      sponsorForm(),
    );
    expect(result).toEqual({
      error: "You must be signed in to add a sponsor.",
    });

    await event.cleanup();
    await person.cleanup();
  });

  test("admin role (events manage) can create, list, update, and delete a sponsor", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createEventSponsorAction(event.id, person.id, sponsorForm()),
    ).toEqual({ success: true });

    const listed = await listEventSponsorsAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0].person.id).toBe(person.id);
    expect(listed.data[0].follow_up_status).toBe("in_progress");

    expect(
      await updateEventSponsorAction(
        listed.data[0].id,
        sponsorForm({ notes: "Signed agreement received" }),
      ),
    ).toEqual({ success: true });

    const afterUpdate = await listEventSponsorsAction(event.id);
    if (!("data" in afterUpdate)) throw new Error("expected data");
    expect(afterUpdate.data[0].notes).toBe("Signed agreement received");

    expect(await deleteEventSponsorAction(listed.data[0].id)).toEqual({
      success: true,
    });

    const afterDelete = await listEventSponsorsAction(event.id);
    if (!("data" in afterDelete)) throw new Error("expected data");
    expect(afterDelete.data).toHaveLength(0);

    await event.cleanup();
    await person.cleanup();
  });

  test("event_coordinator role (events manage) can add a sponsor", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(
      await createEventSponsorAction(event.id, person.id, sponsorForm()),
    ).toEqual({ success: true });

    await event.cleanup();
    await person.cleanup();
  });

  test("finance role (events view only) can list but not write sponsors", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    expect("data" in (await listEventSponsorsAction(event.id))).toBe(true);
    expect(
      await createEventSponsorAction(event.id, person.id, sponsorForm()),
    ).toEqual(DENIED);
    expect(
      await updateEventSponsorAction(crypto.randomUUID(), sponsorForm()),
    ).toEqual(DENIED);
    expect(await deleteEventSponsorAction(crypto.randomUUID())).toEqual(DENIED);

    await event.cleanup();
    await person.cleanup();
  });

  test("volunteer role (events view only) can list but not add sponsors", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    expect("data" in (await listEventSponsorsAction(event.id))).toBe(true);
    expect(
      await createEventSponsorAction(event.id, person.id, sponsorForm()),
    ).toEqual(DENIED);

    await event.cleanup();
    await person.cleanup();
  });

  test("board role (no events access) can neither list nor add sponsors", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await listEventSponsorsAction(event.id)).toEqual(DENIED);
    expect(
      await createEventSponsorAction(event.id, person.id, sponsorForm()),
    ).toEqual(DENIED);

    await event.cleanup();
    await person.cleanup();
  });

  test("a deactivated (former) account cannot add a sponsor", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.former);

    expect(
      await createEventSponsorAction(event.id, person.id, sponsorForm()),
    ).toEqual(DENIED);

    await event.cleanup();
    await person.cleanup();
  });
});
