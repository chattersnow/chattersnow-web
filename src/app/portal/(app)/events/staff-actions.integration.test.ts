// Integration test: the event staff Server Actions against a real local
// Supabase stack (checkPermission, then real `event_staff` RLS). `event_staff`
// is gated on the shared `events` resource -- select on events:view, writes on
// events:manage -- so the interesting cases are the view-only roles, which can
// read the staff list but must not change it. The last case covers the other
// half of #626: an event_staff row is what makes someone staff in the
// directory, and removing the last one takes them off it again.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
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
  listEventStaffAction,
  createEventStaffAction,
  updateEventStaffAction,
  deleteEventStaffAction,
} = await import("./staff-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

function staffForm(overrides: { role?: string; notes?: string } = {}) {
  const fd = new FormData();
  fd.set("role", overrides.role ?? "Basecamp lead");
  fd.set("notes", overrides.notes ?? "Runs the floor for the day");
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

describe("event staff actions (integration)", () => {
  test("requires a signed-in user to add staff", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = anonClient();

    expect(
      await createEventStaffAction(event.id, person.id, staffForm()),
    ).toEqual({ error: "You must be signed in to add staff." });

    await event.cleanup();
    await person.cleanup();
  });

  test("admin role (events manage) can create, list, update, and delete an assignment", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createEventStaffAction(event.id, person.id, staffForm()),
    ).toEqual({ success: true });

    const listed = await listEventStaffAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0].person.id).toBe(person.id);
    expect(listed.data[0].role).toBe("Basecamp lead");

    expect(
      await updateEventStaffAction(
        listed.data[0].id,
        staffForm({ role: "Guide" }),
      ),
    ).toEqual({ success: true });

    const afterUpdate = await listEventStaffAction(event.id);
    if (!("data" in afterUpdate)) throw new Error("expected data");
    expect(afterUpdate.data[0].role).toBe("Guide");

    expect(await deleteEventStaffAction(listed.data[0].id)).toEqual({
      success: true,
    });

    const afterDelete = await listEventStaffAction(event.id);
    if (!("data" in afterDelete)) throw new Error("expected data");
    expect(afterDelete.data).toHaveLength(0);

    await event.cleanup();
    await person.cleanup();
  });

  test("the same person cannot be assigned to one event twice", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await createEventStaffAction(event.id, person.id, staffForm()),
    ).toEqual({ success: true });
    expect(
      await createEventStaffAction(event.id, person.id, staffForm()),
    ).toEqual({
      error: "This person is already assigned to this event as staff.",
    });

    await event.cleanup();
    await person.cleanup();
  });

  test("finance role (events view only) can list but not write staff", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    expect("data" in (await listEventStaffAction(event.id))).toBe(true);
    expect(
      await createEventStaffAction(event.id, person.id, staffForm()),
    ).toEqual(DENIED);

    await event.cleanup();
    await person.cleanup();
  });

  test("an assignment makes someone staff in the directory, and its removal unmakes them", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    async function isStaff() {
      const { data, error } = await adminClient
        .from("people_with_roles")
        .select("is_staff, is_volunteer")
        .eq("id", person.id)
        .single();
      if (error) throw error;
      return data;
    }

    expect((await isStaff()).is_staff).toBe(false);

    await createEventStaffAction(event.id, person.id, staffForm());
    expect((await isStaff()).is_staff).toBe(true);

    // Staff and volunteer are independent: one does not imply the other.
    expect((await isStaff()).is_volunteer).toBe(false);

    const listed = await listEventStaffAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    await deleteEventStaffAction(listed.data[0].id);
    expect((await isStaff()).is_staff).toBe(false);

    await event.cleanup();
    await person.cleanup();
  });

  test("a staff tag holds the role with no assignment behind it", async () => {
    const person = await createPerson();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const { error } = await adminClient
      .from("person_role_tags")
      .insert({ person_id: person.id, role: "staff" });
    expect(error).toBeNull();

    const { data } = await adminClient
      .from("people_with_roles")
      .select("is_staff")
      .eq("id", person.id)
      .single();
    expect(data?.is_staff).toBe(true);

    await person.cleanup();
  });
});
