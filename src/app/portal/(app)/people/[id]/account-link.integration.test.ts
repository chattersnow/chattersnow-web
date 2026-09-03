// Integration test: exercises linkPersonToAuthUserAction and the
// link_person_to_auth_user RPC against a real local Supabase stack, since the
// interesting behavior is the is_admin() gate and the three conflict cases
// the RPC raises -- none of which a mocked client can catch. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createPerson,
  signIn,
} from "../../../../../../test/integration-setup";

mock.module("next/cache", () => ({ revalidatePath: mock(() => {}) }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { linkPersonToAuthUserAction } = await import("../actions");

/** The auth user id behind a seeded account, via its already-linked person. */
async function seededUserId(email: string) {
  const { data, error } = await adminClient
    .from("people")
    .select("id, auth_user_id")
    .eq("email", email)
    .not("auth_user_id", "is", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No linked people row for ${email}`);
  return { personId: data.id as string, userId: data.auth_user_id as string };
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

describe("linkPersonToAuthUserAction", () => {
  test("an admin links an unlinked person to a portal account", async () => {
    currentSupabase = adminClient;
    const { userId, personId: seededPersonId } = await seededUserId(
      SEEDED_USERS.coordinator,
    );

    // Free the account up, then link it to a fresh directory record.
    await adminClient
      .from("people")
      .update({ auth_user_id: null })
      .eq("id", seededPersonId);
    cleanups.push(async () => {
      await adminClient
        .from("people")
        .update({ auth_user_id: userId })
        .eq("id", seededPersonId);
    });

    const person = await createPerson();
    cleanups.push(person.cleanup);

    const result = await linkPersonToAuthUserAction(person.id, userId);
    expect(result).toEqual({ success: true });

    const { data } = await adminClient
      .from("people")
      .select("auth_user_id")
      .eq("id", person.id)
      .single();
    expect(data?.auth_user_id).toBe(userId);

    // Undo before the seeded row is restored, so the unique index is free.
    cleanups.push(async () => {
      await adminClient
        .from("people")
        .update({ auth_user_id: null })
        .eq("id", person.id);
    });
  });

  test("refuses an account already linked to another person", async () => {
    currentSupabase = adminClient;
    const { userId } = await seededUserId(SEEDED_USERS.coordinator);

    const person = await createPerson();
    cleanups.push(person.cleanup);

    const result = await linkPersonToAuthUserAction(person.id, userId);
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain(
      "already linked to another person",
    );
  });

  test("refuses a user id that is not a portal account", async () => {
    currentSupabase = adminClient;
    const person = await createPerson();
    cleanups.push(person.cleanup);

    const result = await linkPersonToAuthUserAction(
      person.id,
      crypto.randomUUID(),
    );
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toContain(
      "No such portal account",
    );
  });

  test("a non-admin is refused before the RPC runs", async () => {
    currentSupabase = await signIn(SEEDED_USERS.coordinator);
    const { userId } = await seededUserId(SEEDED_USERS.coordinator);

    const person = await createPerson();
    cleanups.push(person.cleanup);

    const result = await linkPersonToAuthUserAction(person.id, userId);
    expect(result).toHaveProperty("error");

    const { data } = await adminClient
      .from("people")
      .select("auth_user_id")
      .eq("id", person.id)
      .single();
    expect(data?.auth_user_id).toBeNull();
  });
});
