// Integration test: the /portal/account email-preference action (#488),
// against a real local Supabase stack.
//
// Separate from actions.integration.test.ts alongside it, which exercises the
// preferred-name and pronouns RPCs through a signed-in client directly. This
// one goes through the Server Action, because the thing worth proving is the
// combination: no permission check, ensureCurrentPerson, and an upsert that
// relies on RLS rather than a security definer RPC.
//
// The volunteer case is the load-bearing one. person_notification_preferences'
// policies resolve the caller with my_person_id(), which is security definer
// for a specific reason: the obvious `select id from people where auth_user_id
// = auth.uid()` subquery is subject to the "people select" policy
// (20260826000000), which requires people:view -- so for a volunteer it would
// return nothing and this action would silently save nothing.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  serviceRoleClient,
  signInAs,
} from "../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { updateMyNotificationPreferenceAction } = await import("./actions");

const service = serviceRoleClient();
const KIND = "task_digest";

// supabase/seed.sql opts the admin's own person in, so this table is not empty
// before this file runs (the tenant-isolation suite depends on that). Reads
// here filter that row out rather than removing it.
const seededPersonId = await (async () => {
  const { data, error } = await service
    .from("people")
    .select("id")
    .eq("email", "admin@example.test")
    .single();
  if (error) throw error;
  return data.id as string;
})();

// volunteer@ is deliberately seeded without a people row
// (src/lib/auth/current-person.integration.test.ts depends on it), and this
// action provisions one -- so it has to go back afterwards.
const PROVISIONED_ON_DEMAND = new Set<string>([SEEDED_USERS.volunteer]);
const touchedEmails = new Set<string>();

afterEach(async () => {
  revalidatePathMock.mockClear();
  // By person, not by kind: supabase/seed.sql opts the admin's own person in,
  // and the tenant-isolation suite asserts this table is not empty.
  for (const email of touchedEmails) {
    const personId = await personIdFor(email);
    if (personId) {
      await service
        .from("person_notification_preferences")
        .delete()
        .eq("person_id", personId);
    }
  }
  for (const email of touchedEmails) {
    if (!PROVISIONED_ON_DEMAND.has(email)) continue;
    await service
      .from("people")
      .delete()
      .eq("email", email)
      .not("auth_user_id", "is", null);
  }
  touchedEmails.clear();
});

async function personIdFor(email: string) {
  const { data } = await adminClient
    .from("people")
    .select("id")
    .eq("email", email)
    .not("auth_user_id", "is", null)
    .maybeSingle();
  return data?.id as string | undefined;
}

async function savedRows() {
  const { data, error } = await service
    .from("person_notification_preferences")
    .select("person_id, kind, enabled, tenant_id")
    .neq("person_id", seededPersonId);
  if (error) throw error;
  return data!;
}

describe("updateMyNotificationPreferenceAction (integration)", () => {
  test.each([
    ["a volunteer (people:none)", SEEDED_USERS.volunteer],
    ["a board member", SEEDED_USERS.board],
  ])("%s can turn their own reminders on", async (_label, email) => {
    touchedEmails.add(email);
    currentSupabase = await signInAs(email);

    expect(await updateMyNotificationPreferenceAction(KIND, true)).toEqual({
      success: true,
    });

    const rows = await savedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      person_id: await personIdFor(email),
      kind: KIND,
      enabled: true,
    });
    expect(rows[0].tenant_id).not.toBeNull();
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  test("a board member can turn them back off", async () => {
    touchedEmails.add(SEEDED_USERS.board);
    currentSupabase = await signInAs(SEEDED_USERS.board);

    await updateMyNotificationPreferenceAction(KIND, true);
    expect(await updateMyNotificationPreferenceAction(KIND, false)).toEqual({
      success: true,
    });

    const rows = await savedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBe(false);
  });

  test("saving twice updates one row rather than adding another", async () => {
    touchedEmails.add(SEEDED_USERS.board);
    currentSupabase = await signInAs(SEEDED_USERS.board);

    await updateMyNotificationPreferenceAction(KIND, true);
    await updateMyNotificationPreferenceAction(KIND, true);

    expect(await savedRows()).toHaveLength(1);
  });

  test("it refuses a kind the portal does not send", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(
      await updateMyNotificationPreferenceAction("not_a_real_kind", true),
    ).toEqual({ error: "That is not something the portal sends." });
    expect(await savedRows()).toEqual([]);
  });

  test("it only ever writes the caller's own row", async () => {
    touchedEmails.add(SEEDED_USERS.board);
    currentSupabase = await signInAs(SEEDED_USERS.board);
    await updateMyNotificationPreferenceAction(KIND, true);

    const rows = await savedRows();
    expect(rows.map((row) => row.person_id)).toEqual([
      (await personIdFor(SEEDED_USERS.board))!,
    ]);
  });

  test("an anonymous visitor cannot save anything", async () => {
    currentSupabase = anonClient();

    const result = await updateMyNotificationPreferenceAction(KIND, true);
    expect("error" in result).toBe(true);
    expect(await savedRows()).toEqual([]);
  });
});
