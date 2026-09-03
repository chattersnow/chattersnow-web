// Integration test: exercises resolveCurrentPerson (and the underlying
// resolve_current_person_id RPC) against a real local Supabase stack. This is
// the auto-link-by-email path used to pre-populate the volunteer hours
// self-log dialog (issue #352) with the signed-in user's own identity, so a
// wrong join or a missing RLS grant on the security-definer RPC would not be
// caught by any unit test (those mock the client entirely).
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  signInAs,
} from "../../../test/integration-setup";
import { resolveCurrentPerson, resolveCurrentPersonId } from "./current-person";

const insertedPersonIds: string[] = [];

afterEach(async () => {
  while (insertedPersonIds.length > 0) {
    const id = insertedPersonIds.pop()!;
    await adminClient.from("people").delete().eq("id", id);
  }
});

describe("resolveCurrentPerson / resolveCurrentPersonId (integration)", () => {
  test("returns null when the signed-in user has no matching people row", async () => {
    const supabase = await signInAs(SEEDED_USERS.noAccess);
    expect(await resolveCurrentPersonId(supabase)).toBeNull();
    expect(await resolveCurrentPerson(supabase)).toBeNull();
  });

  test("auto-links and resolves by email on first use, then stays linked", async () => {
    const { data: person, error } = await adminClient
      .from("people")
      .insert({
        name: "Casey Rivera",
        email: SEEDED_USERS.volunteer,
        source_type: "individual",
      })
      .select("id")
      .single();
    if (error) throw error;
    insertedPersonIds.push(person.id as string);

    const supabase = await signInAs(SEEDED_USERS.volunteer);

    expect(await resolveCurrentPerson(supabase)).toEqual({
      id: person.id,
      name: "Casey Rivera",
      preferred_name: null,
      email: SEEDED_USERS.volunteer,
      phone: null,
    });

    const { data: linkedRow, error: linkedError } = await adminClient
      .from("people")
      .select("auth_user_id")
      .eq("id", person.id)
      .single();
    if (linkedError) throw linkedError;
    expect(linkedRow.auth_user_id).not.toBeNull();

    // Second call resolves via the now-linked auth_user_id, not the email
    // fallback -- same result either way.
    expect(await resolveCurrentPersonId(supabase)).toBe(person.id);
  });
});
