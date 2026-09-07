// Integration test: exercises searchPeopleAction against a real local
// Supabase stack (the real people:view check, then real `people` RLS).
//
// This action is the one place in the portal that searches the whole people
// directory from a keystroke, so two things matter beyond "does it find
// anyone": that a role without people:view is refused rather than served a
// filtered list, and that the search term cannot act as a LIKE wildcard --
// `escapeLikePattern` is the only thing stopping a typed "%" from returning
// the entire directory eight rows at a time.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  anonClient,
  createPerson,
  signInAs,
} from "../../../../test/integration-setup";

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { searchPeopleAction } = await import("./command-palette-actions");

const DENIED = { error: "You don't have permission to perform this action." };

function peopleOf(result: Awaited<ReturnType<typeof searchPeopleAction>>) {
  if ("error" in result) throw new Error(`unexpected error: ${result.error}`);
  return result.people;
}

describe("searchPeopleAction (integration)", () => {
  test("finds a person by name for a role with people:view", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const person = await createPerson({ name: `Zzsearch ${tag}` });
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const hits = peopleOf(await searchPeopleAction(`Zzsearch ${tag}`));
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe(person.id);
    expect(hits[0].label).toBe(`Zzsearch ${tag}`);

    await person.cleanup();
  });

  test("finds a person by email as well as by name", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const person = await createPerson({
      name: `Zzemail ${tag}`,
      email: `it-palette-${tag}@example.test`,
    });
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    const hits = peopleOf(
      await searchPeopleAction(`it-palette-${tag}@example.test`),
    );
    expect(hits.map((hit) => hit.id)).toEqual([person.id]);
    // detail falls back to email when there is one.
    expect(hits[0].detail).toBe(`it-palette-${tag}@example.test`);

    await person.cleanup();
  });

  test("a preferred name wins over the legal name in the label", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const person = await createPerson({ name: `Zzpreferred ${tag}` });
    const { adminClient } = await import("../../../../test/integration-setup");
    await adminClient
      .from("people")
      .update({ preferred_name: `Zzpref ${tag}` })
      .eq("id", person.id);

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const hits = peopleOf(await searchPeopleAction(`Zzpreferred ${tag}`));
    expect(hits[0].label).toBe(`Zzpref ${tag}`);

    await person.cleanup();
  });

  test.each([
    ["coordinator", SEEDED_USERS.coordinator],
    ["finance", SEEDED_USERS.finance],
    ["multi", SEEDED_USERS.multi],
  ])("%s role (people view) can search", async (_label, email) => {
    const tag = crypto.randomUUID().slice(0, 8);
    const person = await createPerson({ name: `Zzview ${tag}` });
    currentSupabase = await signInAs(email);

    expect(peopleOf(await searchPeopleAction(`Zzview ${tag}`))).toHaveLength(1);

    await person.cleanup();
  });

  test.each([
    ["board", SEEDED_USERS.board],
    ["volunteer", SEEDED_USERS.volunteer],
    ["noAccess", SEEDED_USERS.noAccess],
    ["former", SEEDED_USERS.former],
  ])(
    "%s role (no people access) is refused, not served a filtered list",
    async (_label, email) => {
      const tag = crypto.randomUUID().slice(0, 8);
      const person = await createPerson({ name: `Zzdenied ${tag}` });
      currentSupabase = await signInAs(email);

      expect(await searchPeopleAction(`Zzdenied ${tag}`)).toEqual(DENIED);

      await person.cleanup();
    },
  );

  test("an anonymous session is refused", async () => {
    currentSupabase = anonClient();

    expect(await searchPeopleAction("anything")).toEqual(DENIED);
  });

  test("a wildcard cannot be typed into the search to dump the directory", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const person = await createPerson({ name: `Zzwild ${tag}` });
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    // "%%" is two characters, so it clears the length guard and reaches the
    // query. Escaped, it matches only a literal "%%" -- which nothing in the
    // seed has -- rather than every row in `people`.
    expect(peopleOf(await searchPeopleAction("%%"))).toEqual([]);
    // Same for the single-character wildcard.
    expect(peopleOf(await searchPeopleAction("__"))).toEqual([]);

    await person.cleanup();
  });

  test("a one-character query returns nothing without touching the database", async () => {
    // The length guard runs before checkPermission, so even a role that would
    // be denied gets the same empty result -- worth pinning, because it means
    // the guard can never be used to probe whether a session has people:view.
    currentSupabase = await signInAs(SEEDED_USERS.volunteer);

    expect(await searchPeopleAction("a")).toEqual({ people: [] });
    expect(await searchPeopleAction("   ")).toEqual({ people: [] });
  });

  test("caps the result list at eight rows", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const people = [];
    for (let i = 0; i < 9; i++) {
      people.push(await createPerson({ name: `Zzcap ${tag} ${i}` }));
    }
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(peopleOf(await searchPeopleAction(`Zzcap ${tag}`))).toHaveLength(8);

    for (const person of people) await person.cleanup();
  });
});
