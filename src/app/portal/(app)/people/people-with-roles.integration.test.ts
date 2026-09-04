// Integration test: public.people_with_roles, the derived role model from
// 20260903030000. The whole point of the change is behavior that only exists
// in the database -- a security-definer derivation, a security_invoker view
// over the people RLS policy, and PostgREST's ability to embed and filter
// through that view -- so none of it is reachable from a mocked client.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  createPerson,
  createPublishedEvent,
  signInAs,
} from "../../../../../test/integration-setup";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function flagsFor(personId: string) {
  const { data, error } = await adminClient
    .from("people_with_roles")
    .select("is_donor, is_sponsor, is_volunteer, is_attendee, is_partner")
    .eq("id", personId)
    .single();
  if (error) throw error;
  return data;
}

describe("people_with_roles", () => {
  test("linking an existing person as an event sponsor sets is_sponsor", async () => {
    const person = await createPerson();
    cleanups.push(person.cleanup);
    const event = await createPublishedEvent();
    cleanups.push(event.cleanup);

    // The bug #620 fixed and this model makes structural: linking an
    // existing person used to leave is_sponsor false, and /portal/sponsors
    // was missing sponsors.
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

    // The second defect: no flag was ever cleared while they were stored.
    expect((await flagsFor(person.id)).is_sponsor).toBe(false);
  });

  test("a registration makes someone an attendee, and its removal unmakes them", async () => {
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

    // And gaining a different role must not wipe the manual assertion.
    // This is why the tags table exists: derivation alone would drop a
    // sponsor entered in the directory before any event link.
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

    // Nothing to keep in step: both answers are read from the donation.
    expect((await flagsFor(first.id)).is_donor).toBe(false);
    expect((await flagsFor(second.id)).is_donor).toBe(true);
  });
  test("the view keeps PostgREST's embed, count, and range working", async () => {
    // The whole reason the view carries people.* rather than the ticket's
    // person_id + flags: the directory reads roles, the primary-contact
    // embed, and its page count in one query, and would owe a second round
    // trip per page if any of the three stopped working through a view.
    // Contact first: cleanups run last-in-first-out, so the organization
    // holding the reference has to be deleted before the row it points at.
    const contact = await createPerson();
    cleanups.push(contact.cleanup);
    const organization = await createPerson({ name: "Integration Test Org" });
    cleanups.push(organization.cleanup);

    await adminClient
      .from("people")
      .update({ primary_contact_person_id: contact.id })
      .eq("id", organization.id);
    await adminClient
      .from("person_role_tags")
      .insert({ person_id: organization.id, role: "sponsor" });

    const { data, count, error } = await adminClient
      .from("people_with_roles")
      // A computed relationship, not the usual column embed: from the view,
      // both directions of people's self-reference are visible and PostgREST
      // rejects the plain form as ambiguous (20260903030000).
      .select("id, name, is_sponsor, primary_contact(id, name, email)", {
        count: "exact",
      })
      .in("id", [organization.id, contact.id])
      .order("name", { ascending: true })
      .range(0, 1);

    expect(error).toBeNull();
    expect(count).toBe(2);
    const row = (data ?? []).find((person) => person.id === organization.id);
    expect(row?.is_sponsor).toBe(true);
    expect(row?.primary_contact).toMatchObject({ id: contact.id });
  });

  test("a role does not depend on the reader's access to the evidence", async () => {
    // event_coordinator holds people:view and finance:none. The derivation
    // runs security definer precisely so this reader sees a donor as a donor
    // without being able to see the donation that makes them one.
    const person = await createPerson();
    cleanups.push(person.cleanup);
    const { data: donation } = await adminClient
      .from("donations")
      .insert({ donor_id: person.id })
      .select("id")
      .single();
    cleanups.push(async () => {
      await adminClient.from("donations").delete().eq("id", donation!.id);
    });

    const coordinator = await signInAs(SEEDED_USERS.coordinator);

    const { data: row, error } = await coordinator
      .from("people_with_roles")
      .select("id, is_donor")
      .eq("id", person.id)
      .single();
    expect(error).toBeNull();
    expect(row?.is_donor).toBe(true);

    const { data: donations } = await coordinator
      .from("donations")
      .select("id")
      .eq("id", donation!.id);
    expect(donations).toEqual([]);
  });

  test("the view is still gated by the people select policy", async () => {
    // security_invoker: definer applies to the derivation only, never to who
    // may see the person. An account with no role assigned sees no rows.
    const person = await createPerson();
    cleanups.push(person.cleanup);

    const noAccess = await signInAs(SEEDED_USERS.noAccess);
    const { data, error } = await noAccess
      .from("people_with_roles")
      .select("id")
      .eq("id", person.id);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  async function createOpportunity(fields: Record<string, unknown>) {
    const { data, error } = await adminClient
      .from("partnership_opportunities")
      .insert(fields)
      .select("id")
      .single();
    if (error) throw error;
    return {
      id: data!.id as string,
      cleanup: async () => {
        await adminClient
          .from("partnership_opportunities")
          .delete()
          .eq("id", data!.id);
      },
    };
  }

  test("only a won partnership makes an organization a partner", async () => {
    const org = await createPerson({ person_type: "organization" });
    cleanups.push(org.cleanup);

    const opportunity = await createOpportunity({
      organization_person_id: org.id,
      stage: "prospecting",
    });
    cleanups.push(opportunity.cleanup);

    // The narrowing is the point: a pipeline row is an intention to call
    // someone, not a partnership with them.
    expect((await flagsFor(org.id)).is_partner).toBe(false);

    await adminClient
      .from("partnership_opportunities")
      .update({ stage: "closed_won" })
      .eq("id", opportunity.id);
    expect((await flagsFor(org.id)).is_partner).toBe(true);

    // And losing it retracts the role, the same way deleting a last
    // sponsorship clears is_sponsor.
    await adminClient
      .from("partnership_opportunities")
      .update({ stage: "closed_lost" })
      .eq("id", opportunity.id);
    expect((await flagsFor(org.id)).is_partner).toBe(false);
  });

  test("owning an opportunity does not make the owner a partner", async () => {
    const org = await createPerson({ person_type: "organization" });
    cleanups.push(org.cleanup);
    const owner = await createPerson();
    cleanups.push(owner.cleanup);

    const opportunity = await createOpportunity({
      organization_person_id: org.id,
      owner_person_id: owner.id,
      stage: "closed_won",
    });
    cleanups.push(opportunity.cleanup);

    expect((await flagsFor(org.id)).is_partner).toBe(true);
    // owner_person_id is the internal staff member driving the opportunity.
    expect((await flagsFor(owner.id)).is_partner).toBe(false);
  });

  test("the partner tag carries the role with no opportunity at all", async () => {
    // The handshake partnership that never went through the pipeline.
    const person = await createPerson({ person_type: "organization" });
    cleanups.push(person.cleanup);

    expect((await flagsFor(person.id)).is_partner).toBe(false);

    const { error } = await adminClient
      .from("person_role_tags")
      .insert({ person_id: person.id, role: "partner" });
    expect(error).toBeNull();
    expect((await flagsFor(person.id)).is_partner).toBe(true);
  });
});
