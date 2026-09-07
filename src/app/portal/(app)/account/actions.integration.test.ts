// Integration test: the point of these cases is RLS, which mocks can't prove.
// public.people update RLS requires people:manage, and board/volunteer hold
// people:none -- yet both must be able to set their own preferred name. That
// only works because set_my_preferred_name is security definer, so this file
// is the only thing standing between that grant and a silent regression.
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  signInAs,
} from "../../../../../test/integration-setup";

async function personFor(email: string) {
  const { data } = await adminClient
    .from("people")
    .select("id, name, preferred_name, auth_user_id")
    .eq("email", email)
    .not("auth_user_id", "is", null)
    .maybeSingle();
  return data;
}

const touchedEmails: string[] = [];

// volunteer@ and noaccess@ are deliberately left without a people row by
// supabase/seed.sql -- src/lib/auth/current-person.integration.test.ts
// depends on that to exercise the link-by-email and no-row paths. These tests
// provision one on purpose, so they have to remove it again rather than
// leaving cross-file state behind.
const PROVISIONED_ON_DEMAND = new Set<string>([SEEDED_USERS.volunteer]);

afterEach(async () => {
  while (touchedEmails.length > 0) {
    const email = touchedEmails.pop()!;
    if (PROVISIONED_ON_DEMAND.has(email)) {
      await adminClient
        .from("people")
        .delete()
        .eq("email", email)
        .not("auth_user_id", "is", null);
      continue;
    }
    await adminClient
      .from("people")
      .update({ preferred_name: null })
      .eq("email", email);
  }
});

describe("set_my_preferred_name (integration)", () => {
  test("a volunteer (people:none) can set their own preferred name", async () => {
    const supabase = await signInAs(SEEDED_USERS.volunteer);
    touchedEmails.push(SEEDED_USERS.volunteer);

    const { error } = await supabase.rpc("set_my_preferred_name", {
      p_preferred_name: "Case",
    });
    expect(error).toBeNull();

    const person = await personFor(SEEDED_USERS.volunteer);
    expect(person?.preferred_name).toBe("Case");
  });

  test("it provisions a people row for an account that has none", async () => {
    // volunteer@ is deliberately unseeded in supabase/seed.sql, so the first
    // call has to create the row via ensure_current_person().
    const supabase = await signInAs(SEEDED_USERS.volunteer);
    touchedEmails.push(SEEDED_USERS.volunteer);

    await supabase.rpc("set_my_preferred_name", { p_preferred_name: "Case" });

    const person = await personFor(SEEDED_USERS.volunteer);
    expect(person?.auth_user_id).not.toBeNull();
  });

  test("an empty value clears the override rather than storing a blank", async () => {
    const supabase = await signInAs(SEEDED_USERS.board);
    touchedEmails.push(SEEDED_USERS.board);

    await supabase.rpc("set_my_preferred_name", { p_preferred_name: "Tay" });
    expect((await personFor(SEEDED_USERS.board))?.preferred_name).toBe("Tay");

    await supabase.rpc("set_my_preferred_name", { p_preferred_name: "   " });
    expect((await personFor(SEEDED_USERS.board))?.preferred_name).toBeNull();
  });

  test("it only ever touches the caller's own row", async () => {
    const before = await personFor(SEEDED_USERS.coordinator);

    const supabase = await signInAs(SEEDED_USERS.board);
    touchedEmails.push(SEEDED_USERS.board);
    await supabase.rpc("set_my_preferred_name", { p_preferred_name: "Tay" });

    const after = await personFor(SEEDED_USERS.coordinator);
    expect(after?.preferred_name).toBe(before?.preferred_name ?? null);
  });

  test("an anonymous caller is rejected", async () => {
    const { error } = await anonClient().rpc("set_my_preferred_name", {
      p_preferred_name: "Nope",
    });
    expect(error).not.toBeNull();
  });
});

describe("set_preferred_name_for_user (integration)", () => {
  test("an admin can set another account's preferred name", async () => {
    const supabase = await signInAs(SEEDED_USERS.admin);
    touchedEmails.push(SEEDED_USERS.finance);

    const target = await personFor(SEEDED_USERS.finance);
    const { error } = await supabase.rpc("set_preferred_name_for_user", {
      p_user_id: target?.auth_user_id,
      p_preferred_name: "Mo",
    });
    expect(error).toBeNull();
    expect((await personFor(SEEDED_USERS.finance))?.preferred_name).toBe("Mo");
  });

  test("a non-admin cannot", async () => {
    const admin = await signInAs(SEEDED_USERS.admin);
    const target = await personFor(SEEDED_USERS.finance);
    void admin;

    const supabase = await signInAs(SEEDED_USERS.volunteer);
    const { error } = await supabase.rpc("set_preferred_name_for_user", {
      p_user_id: target?.auth_user_id,
      p_preferred_name: "Hacked",
    });
    expect(error).not.toBeNull();
    expect((await personFor(SEEDED_USERS.finance))?.preferred_name).toBeNull();
  });
});

describe("ensure_current_person (integration)", () => {
  test("returns the same person id on repeat calls (idempotent)", async () => {
    const supabase = await signInAs(SEEDED_USERS.volunteer);
    touchedEmails.push(SEEDED_USERS.volunteer);

    const first = await supabase.rpc("ensure_current_person");
    const second = await supabase.rpc("ensure_current_person");

    expect(first.error).toBeNull();
    expect(first.data?.[0]?.person_id).toBeTruthy();
    expect(second.data?.[0]?.person_id).toBe(first.data?.[0]?.person_id);
  });

  test("returns no row for an anonymous caller", async () => {
    const { data } = await anonClient().rpc("ensure_current_person");
    expect(data ?? []).toEqual([]);
  });
});
