// Integration test: exercises the real discount code Server Actions against a
// real local Supabase stack (checkPermission, then real `discount_codes`
// RLS). Discount codes are partner-provided comp codes handed to individual
// registrants, and they're gated on the shared `events` resource -- select on
// events:view, writes on events:manage (20260824200000) -- so the view-only
// roles (finance, volunteer) reading the assignment list but never handing a
// code out is the case worth pinning down.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
// Type-only: erased at compile time, so it can't defeat the mock.module call
// below the way a value import of the actions module would.
import type { DiscountCode } from "./discount-codes-actions";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPublishedEvent,
  signInAs,
  uniqueEmail,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const {
  listDiscountCodesAction,
  createDiscountCodesAction,
  assignDiscountCodeAction,
  deleteDiscountCodeAction,
} = await import("./discount-codes-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

// Codes are unique per (event_id, lower(code)), so every batch gets its own
// suffix -- tests that reuse an event would otherwise collide on 23505.
function codesForm() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const fd = new FormData();
  fd.set("codes", `SNOW-${suffix}\nSNOW-${suffix}-B`);
  fd.set("description", "Partner comp codes");
  fd.set("source", "Summit Outdoor Co.");
  return fd;
}

const DENIED = { error: "You don't have permission to perform this action." };

async function seedRegistration(eventId: string) {
  const { data, error } = await adminClient
    .from("event_registrations")
    .insert({
      event_id: eventId,
      name: "Integration Test Registrant",
      email: uniqueEmail("discount-registrant"),
      party_size: 1,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

// Codes are only reachable through the read action, which is itself
// permission-gated -- so seed them as admin and hand the ids to the caller.
async function seedCodes(eventId: string) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const created = await createDiscountCodesAction(eventId, codesForm());
  if ("error" in created) throw new Error(created.error);
  const listed = await listDiscountCodesAction(eventId);
  if (!("data" in listed)) throw new Error("expected data");
  return listed.data;
}

describe("discount code actions (integration)", () => {
  test("requires a signed-in user to add codes", async () => {
    const event = await createPublishedEvent();
    currentSupabase = anonClient();

    expect(await createDiscountCodesAction(event.id, codesForm())).toEqual({
      error: "You must be signed in to add discount codes.",
    });

    await event.cleanup();
  });

  test("admin role (events manage) can create, list, assign, unassign, and delete codes", async () => {
    const event = await createPublishedEvent();
    const registrationId = await seedRegistration(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createDiscountCodesAction(event.id, codesForm())).toEqual({
      success: true,
    });

    const listed = await listDiscountCodesAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(2);
    expect(listed.data[0].source).toBe("Summit Outdoor Co.");

    // Both codes land in one insert and so share a created_at; look the row
    // back up by id rather than trusting its position in the sort.
    const codeId = listed.data[0].id;
    const find = (codes: DiscountCode[]) => {
      const code = codes.find((row) => row.id === codeId);
      if (!code) throw new Error("expected the assigned code to still exist");
      return code;
    };

    expect(await assignDiscountCodeAction(codeId, registrationId)).toEqual({
      success: true,
    });

    const assigned = await listDiscountCodesAction(event.id);
    if (!("data" in assigned)) throw new Error("expected data");
    expect(find(assigned.data).registration?.id).toBe(registrationId);
    expect(find(assigned.data).assigned_at).not.toBeNull();

    expect(await assignDiscountCodeAction(codeId, null)).toEqual({
      success: true,
    });

    const unassigned = await listDiscountCodesAction(event.id);
    if (!("data" in unassigned)) throw new Error("expected data");
    expect(find(unassigned.data).registration).toBeNull();
    expect(find(unassigned.data).assigned_at).toBeNull();

    expect(await deleteDiscountCodeAction(codeId)).toEqual({ success: true });

    const afterDelete = await listDiscountCodesAction(event.id);
    if (!("data" in afterDelete)) throw new Error("expected data");
    expect(afterDelete.data).toHaveLength(1);
    expect(afterDelete.data.some((row) => row.id === codeId)).toBe(false);

    await event.cleanup();
  });

  test("event_coordinator role (events manage) can add codes", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);

    expect(await createDiscountCodesAction(event.id, codesForm())).toEqual({
      success: true,
    });

    await event.cleanup();
  });

  test("finance role (events view only) can list but not write codes", async () => {
    const event = await createPublishedEvent();
    const registrationId = await seedRegistration(event.id);
    const codes = await seedCodes(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.finance);

    const listed = await listDiscountCodesAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(2);

    expect(await createDiscountCodesAction(event.id, codesForm())).toEqual(
      DENIED,
    );
    expect(await assignDiscountCodeAction(codes[0].id, registrationId)).toEqual(
      DENIED,
    );
    expect(await deleteDiscountCodeAction(codes[0].id)).toEqual(DENIED);

    await event.cleanup();
  });

  test("volunteer role (events view only) can list but not write codes", async () => {
    const event = await createPublishedEvent();
    const codes = await seedCodes(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    const listed = await listDiscountCodesAction(event.id);
    if (!("data" in listed)) throw new Error("expected data");
    expect(listed.data).toHaveLength(2);

    expect(await createDiscountCodesAction(event.id, codesForm())).toEqual(
      DENIED,
    );
    expect(await deleteDiscountCodeAction(codes[0].id)).toEqual(DENIED);

    await event.cleanup();
  });

  test("board role (no events access) can neither list nor add codes", async () => {
    const event = await createPublishedEvent();
    await seedCodes(event.id);
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await listDiscountCodesAction(event.id)).toEqual(DENIED);
    expect(await createDiscountCodesAction(event.id, codesForm())).toEqual(
      DENIED,
    );

    await event.cleanup();
  });

  test("a deactivated (former) account cannot add codes", async () => {
    const event = await createPublishedEvent();
    currentSupabase = await signInAs(SEEDED_USERS.former);

    expect(await createDiscountCodesAction(event.id, codesForm())).toEqual(
      DENIED,
    );

    await event.cleanup();
  });
});
