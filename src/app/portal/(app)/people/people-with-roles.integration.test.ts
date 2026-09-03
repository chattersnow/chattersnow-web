// Integration test: the role-flag recompute added by
// 20260903010000_sync_person_role_flags. The whole point of the change is
// behavior that only exists in the database -- triggers, a security-definer
// recompute, and RLS on the new tags table -- so none of it is reachable
// from a mocked client. Requires `bun run db:start && bun run db:reset`
// first; run via `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, test } from "bun:test";
import {
  adminClient,
  createPerson,
  createPublishedEvent,
} from "../../../../../test/integration-setup";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function flagsFor(personId: string) {
  const { data, error } = await adminClient
    .from("people")
    .select("is_donor, is_sponsor, is_volunteer, is_attendee")
    .eq("id", personId)
    .single();
  if (error) throw error;
  return data;
}

describe("sync_person_role_flags", () => {
  test("linking an existing person as an event sponsor sets is_sponsor", async () => {
    const person = await createPerson();
    cleanups.push(person.cleanup);
    const event = await createPublishedEvent();
    cleanups.push(event.cleanup);

    // The bug this ticket fixes: before the trigger, this insert left
    // is_sponsor false and the person never showed on /portal/sponsors.
    expect((await flagsFor(person.id)).is_sponsor).toBe(false);

    const { error } = await adminClient.from("event_sponsors").insert({
      event_id: event.id,
      person_id: person.id,
      support_type: "cash",
    });
    expect(error).toBeNull();

    expect((await flagsFor(person.id)).is_sponsor).toBe(true);
  });

  test("removing the last sponsorship clears is_sponsor again", async () => {
    const person = await createPerson();
    cleanups.push(person.cleanup);
    const event = await createPublishedEvent();
    cleanups.push(event.cleanup);

    const { data: sponsor } = await adminClient
      .from("event_sponsors")
      .insert({
        event_id: event.id,
        person_id: person.id,
        support_type: "cash",
      })
      .select("id")
      .single();
    expect((await flagsFor(person.id)).is_sponsor).toBe(true);

    await adminClient.from("event_sponsors").delete().eq("id", sponsor!.id);

    // The second defect: no flag was ever cleared before this migration.
    expect((await flagsFor(person.id)).is_sponsor).toBe(false);
  });

  test("registering sets is_attendee, replacing the old insert-only trigger", async () => {
    const person = await createPerson();
    cleanups.push(person.cleanup);
    const event = await createPublishedEvent();
    cleanups.push(event.cleanup);

    const { data: registration, error } = await adminClient
      .from("event_registrations")
      .insert({
        event_id: event.id,
        person_id: person.id,
        name: "Role Flag Test",
        email: `it-roleflags-${crypto.randomUUID()}@example.test`,
        party_size: 1,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect((await flagsFor(person.id)).is_attendee).toBe(true);

    await adminClient
      .from("event_registrations")
      .delete()
      .eq("id", registration!.id);
    expect((await flagsFor(person.id)).is_attendee).toBe(false);
  });

  test("a manual tag holds a role on with no source record behind it", async () => {
    const person = await createPerson();
    cleanups.push(person.cleanup);

    const { error } = await adminClient
      .from("person_role_tags")
      .insert({ person_id: person.id, role: "sponsor" });
    expect(error).toBeNull();
    expect((await flagsFor(person.id)).is_sponsor).toBe(true);

    // And an unrelated sync -- triggered here by gaining a different role --
    // must not wipe the manual assertion. This is why the tags table exists:
    // without it, "recompute and clear" would drop directory-only sponsors.
    const event = await createPublishedEvent();
    cleanups.push(event.cleanup);
    await adminClient.from("event_registrations").insert({
      event_id: event.id,
      person_id: person.id,
      name: "Role Flag Test",
      email: `it-roleflags-${crypto.randomUUID()}@example.test`,
      party_size: 1,
    });

    const flags = await flagsFor(person.id);
    expect(flags.is_sponsor).toBe(true);
    expect(flags.is_attendee).toBe(true);

    await adminClient
      .from("person_role_tags")
      .delete()
      .eq("person_id", person.id)
      .eq("role", "sponsor");
    expect((await flagsFor(person.id)).is_sponsor).toBe(false);
  });

  test("re-pointing a donation at another donor clears the first one", async () => {
    const first = await createPerson();
    cleanups.push(first.cleanup);
    const second = await createPerson();
    cleanups.push(second.cleanup);

    const { data: donation, error } = await adminClient
      .from("donations")
      .insert({ donor_id: first.id })
      .select("id")
      .single();
    expect(error).toBeNull();
    cleanups.push(async () => {
      await adminClient.from("donations").delete().eq("id", donation!.id);
    });

    expect((await flagsFor(first.id)).is_donor).toBe(true);

    await adminClient
      .from("donations")
      .update({ donor_id: second.id })
      .eq("id", donation!.id);

    // Both sides of the update are synced, not just the new one.
    expect((await flagsFor(first.id)).is_donor).toBe(false);
    expect((await flagsFor(second.id)).is_donor).toBe(true);
  });
});
