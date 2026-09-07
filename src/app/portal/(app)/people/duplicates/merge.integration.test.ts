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
  serviceRoleClient,
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

// #748. A merge is destructive and unrepeatable: it repoints every FK onto
// the survivor and then deletes the duplicate. Two of them overlapping is the
// case where half the records could follow one survivor and half another, and
// no test above fires two at once -- so the `for update` pair at the top of
// merge_people has never actually been exercised.
describe("merge_people under concurrency", () => {
  async function mergeRecords(duplicateIds: string[]) {
    const { data, error } = await serviceRoleClient()
      .from("person_merges")
      .select("id, survivor_person_id, merged_person_id")
      .in("merged_person_id", duplicateIds);
    if (error) throw error;
    return data;
  }

  async function forgetMerges(duplicateIds: string[]) {
    // person_merges is append-only for authenticated (20260904180000), so the
    // audit rows these tests write can only be cleaned up service-side.
    await serviceRoleClient()
      .from("person_merges")
      .delete()
      .in("merged_person_id", duplicateIds);
  }

  async function survivingIds(ids: string[]) {
    const { data, error } = await adminClient
      .from("people")
      .select("id")
      .in("id", ids);
    if (error) throw error;
    return (data ?? []).map((row) => row.id as string);
  }

  test("merging the same pair twice at once absorbs the duplicate once", async () => {
    const survivor = await makePerson({
      name: "Race Survivor",
      email: uniqueEmail("race-s"),
    });
    const duplicate = await makePerson({
      name: "Race Duplicate",
      email: uniqueEmail("race-d"),
      notes: "carried over",
    });
    const { error: donationError } = await adminClient
      .from("donations")
      .insert({ donor_id: duplicate });
    expect(donationError).toBeNull();

    currentSupabase = await signIn(SEEDED_USERS.admin);
    const results = await Promise.all([
      mergePeopleAction(survivor, duplicate),
      mergePeopleAction(survivor, duplicate),
    ]);

    expect(results.filter((result) => "success" in result)).toHaveLength(1);
    expect(await survivingIds([survivor, duplicate])).toEqual([survivor]);

    // One audit row, and the duplicate's donation moved exactly once -- a
    // second pass would have found nothing to repoint and recorded a merge
    // that did not happen.
    const merges = await mergeRecords([duplicate]);
    expect(merges).toHaveLength(1);
    expect(merges[0].survivor_person_id).toBe(survivor);

    const { data: donations } = await adminClient
      .from("donations")
      .select("id")
      .eq("donor_id", survivor);
    expect(donations).toHaveLength(1);

    await forgetMerges([duplicate]);
  });

  // Two staff each merging the same duplicate into a different survivor. The
  // duplicate can only be absorbed by one of them; the other must be told so
  // rather than repointing a share of the records at a second survivor.
  test("a duplicate claimed by two survivors at once goes to exactly one", async () => {
    const firstSurvivor = await makePerson({
      name: "First Survivor",
      email: uniqueEmail("claim-1"),
    });
    const secondSurvivor = await makePerson({
      name: "Second Survivor",
      email: uniqueEmail("claim-2"),
    });
    const duplicate = await makePerson({
      name: "Contested Duplicate",
      email: uniqueEmail("claim-d"),
    });
    await adminClient
      .from("donations")
      .insert([{ donor_id: duplicate }, { donor_id: duplicate }]);

    currentSupabase = await signIn(SEEDED_USERS.admin);
    const results = await Promise.all([
      mergePeopleAction(firstSurvivor, duplicate),
      mergePeopleAction(secondSurvivor, duplicate),
    ]);

    expect(results.filter((result) => "success" in result)).toHaveLength(1);

    const merges = await mergeRecords([duplicate]);
    expect(merges).toHaveLength(1);
    const winner = merges[0].survivor_person_id as string;
    expect([firstSurvivor, secondSurvivor]).toContain(winner);

    // Both donations followed the same survivor. A split here is the exact
    // corruption this case exists to catch.
    const { data: donations } = await adminClient
      .from("donations")
      .select("donor_id")
      .in("donor_id", [firstSurvivor, secondSurvivor]);
    expect(donations).toHaveLength(2);
    expect(new Set(donations!.map((row) => row.donor_id)).size).toBe(1);
    expect(donations![0].donor_id).toBe(winner);

    await forgetMerges([duplicate]);
  });

  // The same pair in opposite directions -- two staff who disagree about which
  // record is the keeper. Whichever way the two transactions take their locks,
  // one person must survive holding everything.
  test("opposing merges of one pair still leave one record holding everything", async () => {
    const left = await makePerson({
      name: "Left Record",
      email: uniqueEmail("opposed-l"),
    });
    const right = await makePerson({
      name: "Right Record",
      email: uniqueEmail("opposed-r"),
    });
    await adminClient
      .from("donations")
      .insert([{ donor_id: left }, { donor_id: right }]);

    currentSupabase = await signIn(SEEDED_USERS.admin);
    const results = await Promise.all([
      mergePeopleAction(left, right),
      mergePeopleAction(right, left),
    ]);

    expect(results.filter((result) => "success" in result)).toHaveLength(1);

    const survivors = await survivingIds([left, right]);
    expect(survivors).toHaveLength(1);

    const { data: donations } = await adminClient
      .from("donations")
      .select("donor_id")
      .in("donor_id", [left, right]);
    expect(donations).toHaveLength(2);
    expect(donations!.every((row) => row.donor_id === survivors[0])).toBe(true);

    await forgetMerges([left, right]);
  });
});
