// Integration test for the two duplicate-merge reads that
// `merge.integration.test.ts` does not reach: getMergeCandidatesAction (the
// two records the review screen shows) and getMergePreviewAction (the
// per-table row counts an operator reads before committing an irreversible
// merge).
//
// Both are gated on people:manage, which only admin holds -- notably not
// coordinator or finance, who hold people:view and can see the directory.
// A read that leaked here would expose the full identity columns of two
// people side by side, and the preview would additionally reveal how many
// donation and registration rows attach to each, so the denial cases matter
// as much as the happy path.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  signInAs,
  uniqueEmail,
} from "../../../../../../test/integration-setup";

mock.module("next/cache", () => ({ revalidatePath: mock(() => {}) }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { getMergeCandidatesAction, getMergePreviewAction } =
  await import("./actions");

const DENIED = { error: "You don't have permission to perform this action." };
const DENIED_ROLES = [
  ["coordinator", SEEDED_USERS.coordinator],
  ["finance", SEEDED_USERS.finance],
  ["board", SEEDED_USERS.board],
  ["volunteer", SEEDED_USERS.volunteer],
  ["multi", SEEDED_USERS.multi],
  ["noAccess", SEEDED_USERS.noAccess],
  ["former", SEEDED_USERS.former],
] as const;

const created: string[] = [];

async function makePerson(fields: Record<string, unknown> = {}) {
  const { data, error } = await adminClient
    .from("people")
    .insert({
      source_type: "individual",
      name: `IT Dup ${crypto.randomUUID()}`,
      ...fields,
    })
    .select("id")
    .single();
  if (error) throw error;
  created.push(data.id as string);
  return data.id as string;
}

afterEach(async () => {
  if (created.length) {
    await adminClient.from("donations").delete().in("donor_id", created);
    await adminClient.from("people").delete().in("id", created);
    created.length = 0;
  }
});

describe("getMergeCandidatesAction (integration)", () => {
  test("returns both records by id, with a lowercased email key", async () => {
    const email = uniqueEmail("cand");
    const survivorId = await makePerson({ email: email.toUpperCase() });
    const duplicateId = await makePerson({ name: "IT Dup no email" });

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getMergeCandidatesAction([survivorId, duplicateId]);
    if ("error" in result) throw new Error(result.error);

    expect(result.data.map((row) => row.id).sort()).toEqual(
      [survivorId, duplicateId].sort(),
    );

    const survivor = result.data.find((row) => row.id === survivorId)!;
    // The screen groups on email_key, so an address that differs only by case
    // has to normalise -- otherwise the same person reads as two.
    expect(survivor.email_key).toBe(email.toLowerCase());

    const duplicate = result.data.find((row) => row.id === duplicateId)!;
    // A person with no email must key to "" rather than to null, or the
    // grouping throws instead of showing them as ungrouped.
    expect(duplicate.email_key).toBe("");
  });

  test("fetches by id rather than filtering to detected duplicates", async () => {
    // The whole reason this exists rather than reusing
    // find_duplicate_people(): since the unique index landed
    // (20260904190000) that list is empty by definition, and merging is still
    // needed for one person filed under two different addresses.
    const survivorId = await makePerson({ email: uniqueEmail("distinct-a") });
    const duplicateId = await makePerson({ email: uniqueEmail("distinct-b") });

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getMergeCandidatesAction([survivorId, duplicateId]);
    if ("error" in result) throw new Error(result.error);

    expect(result.data).toHaveLength(2);
  });

  test("an id that matches nothing comes back as a short list, not an error", async () => {
    const survivorId = await makePerson();

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getMergeCandidatesAction([
      survivorId,
      crypto.randomUUID(),
    ]);
    if ("error" in result) throw new Error(result.error);

    expect(result.data.map((row) => row.id)).toEqual([survivorId]);
  });

  test("an empty id list returns nothing", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getMergeCandidatesAction([]);
    if ("error" in result) throw new Error(result.error);

    expect(result.data).toEqual([]);
  });

  test.each(DENIED_ROLES)(
    "%s (no people:manage) is refused",
    async (_label, email) => {
      const survivorId = await makePerson();
      currentSupabase = await signInAs(email);

      expect(await getMergeCandidatesAction([survivorId])).toEqual(DENIED);
    },
  );

  test("an anonymous session is refused", async () => {
    currentSupabase = anonClient();

    expect(await getMergeCandidatesAction([crypto.randomUUID()])).toEqual(
      DENIED,
    );
  });
});

describe("getMergePreviewAction (integration)", () => {
  test("reports what each side would bring to the merge", async () => {
    const survivorId = await makePerson({ email: uniqueEmail("prev-s") });
    const duplicateId = await makePerson({ email: uniqueEmail("prev-d") });

    // Two donations on the duplicate, one on the survivor, so the two
    // columns of the preview cannot be confused for each other.
    const { error } = await adminClient.from("donations").insert([
      { donor_id: survivorId, notes: "IT preview survivor" },
      { donor_id: duplicateId, notes: "IT preview duplicate 1" },
      { donor_id: duplicateId, notes: "IT preview duplicate 2" },
    ]);
    if (error) throw error;

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getMergePreviewAction(survivorId, duplicateId);
    if ("error" in result) throw new Error(result.error);

    const donations = result.data.find((row) => row.table_name === "donations");
    expect(donations).toBeDefined();
    expect(Number(donations!.survivor_count)).toBe(1);
    expect(Number(donations!.duplicate_count)).toBe(2);
  });

  test("two untouched records preview as nothing to move", async () => {
    const survivorId = await makePerson({ email: uniqueEmail("empty-s") });
    const duplicateId = await makePerson({ email: uniqueEmail("empty-d") });

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getMergePreviewAction(survivorId, duplicateId);
    if ("error" in result) throw new Error(result.error);

    for (const row of result.data) {
      expect(Number(row.survivor_count) + Number(row.duplicate_count)).toBe(0);
    }
  });

  test("the preview has no same-person guard of its own", async () => {
    // Unlike person_merge_blockers, person_merge_preview (20260904180000)
    // only counts rows -- it never checks that the two ids differ. Asked to
    // preview a record against itself it answers with two identical columns
    // rather than refusing. Pinned because it means the preview alone is not
    // enough to decide a merge is safe: the blockers call is what refuses,
    // and a screen that dropped it would show a plausible-looking self-merge.
    const personId = await makePerson({ email: uniqueEmail("self") });
    const { error } = await adminClient
      .from("donations")
      .insert({ donor_id: personId, notes: "IT self preview" });
    if (error) throw error;

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getMergePreviewAction(personId, personId);
    if ("error" in result) throw new Error(result.error);

    const donations = result.data.find((row) => row.table_name === "donations");
    expect(Number(donations!.survivor_count)).toBe(1);
    expect(Number(donations!.duplicate_count)).toBe(1);
  });

  test("passes the RPC's own refusal through instead of flattening it", async () => {
    const survivorId = await makePerson({ email: uniqueEmail("ghost") });

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const result = await getMergePreviewAction(survivorId, crypto.randomUUID());

    // The RPC raises readable text for an id that matches no person, and the
    // action forwards `error.message` rather than its own generic string --
    // the operator needs to know it was a bad id, not a failed query.
    expect(result).toEqual({ error: "No such person" });
  });

  test.each(DENIED_ROLES)(
    "%s (no people:manage) cannot preview a merge",
    async (_label, email) => {
      const survivorId = await makePerson({ email: uniqueEmail("deny-s") });
      const duplicateId = await makePerson({ email: uniqueEmail("deny-d") });
      currentSupabase = await signInAs(email);

      expect(await getMergePreviewAction(survivorId, duplicateId)).toEqual(
        DENIED,
      );
    },
  );

  test("an anonymous session is refused", async () => {
    currentSupabase = anonClient();

    expect(
      await getMergePreviewAction(crypto.randomUUID(), crypto.randomUUID()),
    ).toEqual(DENIED);
  });
});
