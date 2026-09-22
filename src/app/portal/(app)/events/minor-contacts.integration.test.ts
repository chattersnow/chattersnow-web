// Integration test: who can read the accompanying-adult and emergency
// contacts a party with a minor gives (#685).
//
// This is the one gate in the registrants list that is a *privilege* rather
// than a convention. The rider block beside it is chosen in TypeScript --
// `listEventRegistrantsAction` selects those columns or does not -- which
// anybody holding `events:view` could go round with a direct PostgREST call.
// A child's guardian's mobile number is a different call, so 20260922040000
// revokes the four columns from `authenticated` on the table and serves them
// only through `event_registration_minor_contacts`, a security-definer view
// that checks `events:manage` itself.
//
// So the cases below are deliberately not "the action returns null": they go
// straight at the table and the view with a signed-in session that holds
// `events:view` and nothing more.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPublishedEvent,
  deleteEvent,
  serviceRoleClient,
  signInAs,
  uniqueEmail,
} from "../../../../../test/integration-setup";

/** The four. Named once, and this list is what the guard below is about. */
const GATED_COLUMNS = [
  "accompanying_adult_name",
  "accompanying_adult_phone",
  "emergency_contact_name",
  "emergency_contact_phone",
] as const;

const service = serviceRoleClient();
// `volunteer` holds events:view and nothing higher — the door shift this
// split exists to draw a line around.
const doorShift = await signInAs(SEEDED_USERS.volunteer);

const event = await createPublishedEvent({ name: "Minors gate event" });

const { data: seeded, error: seedError } = await service
  .from("event_registrations")
  .insert({
    event_id: event.id,
    name: "Integration Test Registrant",
    email: uniqueEmail("minor-party"),
    party_size: 3,
    party_includes_minor: true,
    accompanying_adult_name: "Robin Rivera",
    accompanying_adult_phone: "555-0101",
    emergency_contact_name: "Sam Rivera",
    emergency_contact_phone: "555-0102",
  })
  .select("id")
  .single();
if (seedError) throw seedError;
const registrationId = seeded.id as string;

afterAll(async () => {
  await service.from("event_registrations").delete().eq("id", registrationId);
  await deleteEvent(event.id);
});

describe("the four contacts on event_registrations", () => {
  test("are not readable from the table by anybody signed in", async () => {
    for (const client of [doorShift, adminClient]) {
      for (const column of GATED_COLUMNS) {
        const { error } = await client
          .from("event_registrations")
          .select(column)
          .eq("id", registrationId);
        // Including the admin session: the revoke is on the `authenticated`
        // role, which every signed-in session is, so holding events:manage
        // buys the view rather than the column.
        expect(error).not.toBeNull();
      }
    }
  });

  // The revoke replaced a table-wide grant with an explicit column list, so a
  // column added later without being added to that list simply disappears from
  // the portal. That fails closed, which is the right direction, but it is a
  // bad afternoon to debug — hence this.
  test("are the only columns a signed-in reader cannot select", async () => {
    const { data, error } = await service
      .from("event_registrations")
      .select("*")
      .eq("id", registrationId)
      .single();
    if (error) throw error;

    const ungranted: string[] = [];
    for (const column of Object.keys(data)) {
      const result = await adminClient
        .from("event_registrations")
        .select(column)
        .eq("id", registrationId);
      if (result.error) ungranted.push(column);
    }

    expect(ungranted.sort()).toEqual([...GATED_COLUMNS].sort());
  });

  test("the flag itself is readable by a door shift", async () => {
    const { data, error } = await doorShift
      .from("event_registrations")
      .select("party_includes_minor")
      .eq("id", registrationId)
      .single();

    expect(error).toBeNull();
    expect(data?.party_includes_minor).toBe(true);
  });
});

describe("event_registration_minor_contacts", () => {
  test("hands the contacts to events:manage", async () => {
    const { data, error } = await adminClient
      .from("event_registration_minor_contacts")
      .select("*")
      .eq("registration_id", registrationId)
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      accompanying_adult_name: "Robin Rivera",
      accompanying_adult_phone: "555-0101",
      emergency_contact_name: "Sam Rivera",
      emergency_contact_phone: "555-0102",
    });
  });

  test("hands a door shift nothing at all", async () => {
    const { data, error } = await doorShift
      .from("event_registration_minor_contacts")
      .select("*")
      .eq("registration_id", registrationId);

    // Not an error and not a redacted row: no rows. The view's own
    // `has_permission('events', 'manage')` is in its WHERE clause, so a reader
    // without it sees an empty relation rather than a refusal that would tell
    // them something exists.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("is closed to the signed-out public", async () => {
    const { error } = await anonClient()
      .from("event_registration_minor_contacts")
      .select("*")
      .eq("registration_id", registrationId);

    // The view is granted to `authenticated` only, so this is a refusal rather
    // than an empty result — `anon` cannot reach the relation at all.
    expect(error).not.toBeNull();
  });
});
