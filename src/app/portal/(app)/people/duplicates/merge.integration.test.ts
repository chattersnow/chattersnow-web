// Integration test for the person merge RPCs (20260904180000) against a real
// local Supabase stack: the permission gate, the generic FK repoint, the
// redundancy pre-deletes, the blockers that must refuse rather than guess, and
// the override allowlist that stops a people:manage holder rewriting identity.
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  signIn,
  uniqueEmail,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { listDuplicatePeopleAction, getMergeBlockersAction, mergePeopleAction } =
  await import("./actions");

const created: string[] = [];

async function makePerson(fields: Record<string, unknown>) {
  const { data, error } = await adminClient
    .from("people")
    .insert({ source_type: "individual", ...fields })
    .select("id")
    .single();
  if (error) throw error;
  created.push(data.id as string);
  return data.id as string;
}

afterEach(async () => {
  revalidatePathMock.mockClear();
  if (created.length) {
    await adminClient.from("donations").delete().in("donor_id", created);
    await adminClient
      .from("event_registrations")
      .delete()
      .in("person_id", created);
    await adminClient.from("people").delete().in("id", created);
    created.length = 0;
  }
});

describe("merge_people (integration)", () => {
  test("repoints records, dedupes role tags, and deletes the duplicate", async () => {
    // Distinct addresses: since 20260904190000 the index forbids a real
    // duplicate pair, and merge_people deliberately does not require the two
    // records to share an email -- an admin merges whichever pair they judge
    // to be the same person.
    const survivor = await makePerson({
      name: "Survivor",
      email: uniqueEmail("merge-s"),
    });
    const duplicate = await makePerson({
      name: "Duplicate",
      email: uniqueEmail("merge-d"),
      notes: "carried over",
    });

    // A donation on the duplicate, and a role tag both records share.
    const { error: donationError } = await adminClient
      .from("donations")
      .insert({ donor_id: duplicate });
    expect(donationError).toBeNull();
    await adminClient.from("person_role_tags").insert([
      { person_id: survivor, role: "donor" },
      { person_id: duplicate, role: "donor" },
      { person_id: duplicate, role: "volunteer" },
    ]);

    currentSupabase = await signIn(SEEDED_USERS.admin);
    const result = await mergePeopleAction(survivor, duplicate, {
      name: "Merged Survivor",
    });
    expect(result).toEqual({ success: true });

    const { data: rows } = await adminClient
      .from("people")
      .select("id, name, notes")
      .in("id", [survivor, duplicate]);
    expect(rows).toHaveLength(1);
    expect(rows![0].id).toBe(survivor);
    expect(rows![0].name).toBe("Merged Survivor");
    // A field the survivor had no value for is filled from the duplicate.
    expect(rows![0].notes).toBe("carried over");

    const { data: donations } = await adminClient
      .from("donations")
      .select("id")
      .eq("donor_id", survivor);
    expect(donations).toHaveLength(1);

    // 'donor' existed on both; it must not be duplicated by the repoint.
    const { data: tags } = await adminClient
      .from("person_role_tags")
      .select("role")
      .eq("person_id", survivor);
    expect(tags!.map((t) => t.role).sort()).toEqual(["donor", "volunteer"]);

    // Roles are derived by people_with_roles at read time (20260903030000),
    // so the union falls out of the repoint with no recompute step.
    const { data: withRoles } = await adminClient
      .from("people_with_roles")
      .select("is_donor, is_volunteer")
      .eq("id", survivor)
      .single();
    expect(withRoles).toMatchObject({ is_donor: true, is_volunteer: true });

    const { data: audit } = await adminClient
      .from("person_merges")
      .select("merged_person_id, merged_snapshot, repointed")
      .eq("survivor_person_id", survivor)
      .single();
    expect(audit!.merged_person_id).toBe(duplicate);
    expect((audit!.merged_snapshot as { name: string }).name).toBe("Duplicate");
    expect(audit!.repointed).toMatchObject({ "donations.donor_id": 1 });
  });

  test("refuses when both records are linked to different portal accounts", async () => {
    // Two auth accounts that no people row already claims -- the seed links
    // six of the eight (seed.sql:74), deliberately leaving some unlinked.
    const { data: free } = await adminClient.rpc("list_portal_users");
    const unlinked = (free as { user_id: string; person_id: string | null }[])
      .filter((u) => u.person_id === null)
      .slice(0, 2);
    expect(unlinked.length).toBe(2);

    const survivor = await makePerson({
      name: "Acct S",
      email: uniqueEmail("merge-acct-s"),
      auth_user_id: unlinked[0].user_id,
    });
    const duplicate = await makePerson({
      name: "Acct D",
      email: uniqueEmail("merge-acct-d"),
      auth_user_id: unlinked[1].user_id,
    });

    currentSupabase = await signIn(SEEDED_USERS.admin);
    const blockers = await getMergeBlockersAction(survivor, duplicate);
    const hard = ("data" in blockers ? blockers.data : []).filter(
      (b) => b.kind === "blocker",
    );
    expect(hard).toHaveLength(1);
    expect(hard[0].table_name).toBe("people");

    // Same stance as link_person_to_auth_user: refuse rather than silently
    // drop somebody's portal access.
    const result = await mergePeopleAction(survivor, duplicate);
    expect("error" in result).toBe(true);

    const { data: rows } = await adminClient
      .from("people")
      .select("id")
      .in("id", [survivor, duplicate]);
    expect(rows).toHaveLength(2);
  });

  test("refuses a pair registered for the same event, leaving both records intact", async () => {
    const survivor = await makePerson({
      name: "Evt S",
      email: uniqueEmail("merge-evt-s"),
    });
    const duplicate = await makePerson({
      name: "Evt D",
      email: uniqueEmail("merge-evt-d"),
    });

    const { data: event } = await adminClient
      .from("events")
      .select("id")
      .limit(1)
      .single();

    await adminClient.from("event_registrations").insert([
      {
        event_id: event!.id,
        person_id: survivor,
        name: "Evt S",
        email: uniqueEmail("reg-s"),
      },
      {
        event_id: event!.id,
        person_id: duplicate,
        name: "Evt D",
        email: uniqueEmail("reg-d"),
      },
    ]);

    currentSupabase = await signIn(SEEDED_USERS.admin);
    const blockers = await getMergeBlockersAction(survivor, duplicate);
    const hard = ("data" in blockers ? blockers.data : []).filter(
      (b) => b.kind === "blocker",
    );
    expect(hard).toHaveLength(1);
    expect(hard[0].table_name).toBe("event_registrations");

    const result = await mergePeopleAction(survivor, duplicate);
    expect("error" in result).toBe(true);

    // Nothing was half-applied.
    const { data: rows } = await adminClient
      .from("people")
      .select("id")
      .in("id", [survivor, duplicate]);
    expect(rows).toHaveLength(2);
  });

  test("ignores override keys outside the allowlist", async () => {
    const survivor = await makePerson({
      name: "Inj S",
      email: uniqueEmail("merge-inj-s"),
    });
    const duplicate = await makePerson({
      name: "Inj D",
      email: uniqueEmail("merge-inj-d"),
    });

    currentSupabase = await signIn(SEEDED_USERS.admin);
    const result = await mergePeopleAction(survivor, duplicate, {
      name: "Inj Survivor",
      // Not on MERGEABLE_FIELDS; must never reach the RPC.
      id: "00000000-0000-0000-0000-000000000001",
      auth_user_id: "00000000-0000-0000-0000-000000000002",
    } as never);
    expect(result).toEqual({ success: true });

    const { data: row } = await adminClient
      .from("people")
      .select("id, name, auth_user_id")
      .eq("id", survivor)
      .single();
    expect(row).toMatchObject({
      id: survivor,
      name: "Inj Survivor",
      auth_user_id: null,
    });
  });

  test("the unique index blocks a duplicate address but allows two anonymous rows", async () => {
    const email = uniqueEmail("uniq");
    await makePerson({ name: "First", email });

    const { error } = await adminClient
      .from("people")
      .insert({ name: "Second", source_type: "individual", email });
    expect(error?.code).toBe("23505");

    // create_donation_with_items (20260824170000) deliberately inserts a fresh
    // row per anonymous donation, so anonymous rows stay out of the index.
    const anonEmail = uniqueEmail("uniq-anon");
    const a = await makePerson({
      name: "Anon A",
      email: anonEmail,
      is_anonymous: true,
    });
    const b = await makePerson({
      name: "Anon B",
      email: anonEmail,
      is_anonymous: true,
    });
    expect(a).not.toBe(b);
  });

  test("is refused for a role without people:manage", async () => {
    currentSupabase = await signIn(SEEDED_USERS.volunteer);
    const listed = await listDuplicatePeopleAction();
    expect("error" in listed).toBe(true);

    const merged = await mergePeopleAction(
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    );
    expect("error" in merged).toBe(true);
  });
});
