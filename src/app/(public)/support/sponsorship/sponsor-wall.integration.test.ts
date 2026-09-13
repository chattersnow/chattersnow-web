// Integration test: the `public_sponsor_wall` view behind the sponsor wall on
// /support/sponsorship (#914), both of its arms -- credited on a published
// public event, and published by hand on a sponsor role tag (#1024). Mocks nothing -- the point is what `anon`
// actually gets back, since the view is security definer and its own
// predicates are the only thing between the public page and the `people`
// directory. Cross-tenant isolation is covered separately, with a marker row
// in two tenants, by src/lib/portal/tenant-isolation.integration.test.ts.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, test } from "bun:test";
import {
  adminClient,
  anonClient,
  createPerson,
  createPublishedEvent,
} from "../../../../../test/integration-setup";

type WallRow = {
  sponsor_id: string;
  name: string;
  logo_url: string | null;
  website: string | null;
};

async function sponsor(
  eventId: string,
  personId: string,
  isPublic: boolean,
): Promise<void> {
  const { error } = await adminClient.from("event_sponsors").insert({
    event_id: eventId,
    person_id: personId,
    support_type: "cash",
    is_public: isPublic,
  });
  if (error) throw error;
}

/**
 * The hand-published arm (#1024): a sponsor role asserted by staff and marked
 * public, with no event anywhere. Written straight to the table rather than
 * through `set_person_role_tags`, to keep this file about what the view
 * returns; the RPC's own behaviour is exercised by the portal's tests.
 */
async function sponsorTag(personId: string, isPublic: boolean): Promise<void> {
  const { error } = await adminClient
    .from("person_role_tags")
    .insert({ person_id: personId, role: "sponsor", is_public: isPublic });
  if (error) throw error;
}

async function wallRowsFor(personId: string): Promise<WallRow[]> {
  const { data, error } = await anonClient()
    .from("public_sponsor_wall")
    .select("sponsor_id, name, logo_url, website")
    .eq("sponsor_id", personId);
  if (error) throw error;
  return (data ?? []) as WallRow[];
}

describe("public_sponsor_wall (integration)", () => {
  test("a sponsor marked public on a published public event is on the wall", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson({ person_type: "organization" });
    await adminClient
      .from("people")
      .update({
        logo_url: "https://example.test/logo.png",
        website: "https://example.test",
      })
      .eq("id", person.id);
    await sponsor(event.id, person.id, true);

    expect(await wallRowsFor(person.id)).toEqual([
      {
        sponsor_id: person.id,
        name: expect.any(String),
        logo_url: "https://example.test/logo.png",
        website: "https://example.test",
      },
    ]);

    await event.cleanup();
    await person.cleanup();
  });

  test("a sponsorship not marked public stays off the wall", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    await sponsor(event.id, person.id, false);

    expect(await wallRowsFor(person.id)).toEqual([]);

    await event.cleanup();
    await person.cleanup();
  });

  test("a draft or private event keeps its public sponsors off the wall", async () => {
    const draft = await createPublishedEvent({ status: "draft" });
    const priv = await createPublishedEvent({ visibility: "private" });
    const draftSponsor = await createPerson();
    const privateSponsor = await createPerson();
    await sponsor(draft.id, draftSponsor.id, true);
    await sponsor(priv.id, privateSponsor.id, true);

    expect(await wallRowsFor(draftSponsor.id)).toEqual([]);
    expect(await wallRowsFor(privateSponsor.id)).toEqual([]);

    await draft.cleanup();
    await priv.cleanup();
    await draftSponsor.cleanup();
    await privateSponsor.cleanup();
  });

  test("a sponsor of several events appears exactly once", async () => {
    const first = await createPublishedEvent({
      startsAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const second = await createPublishedEvent();
    const person = await createPerson();
    await sponsor(first.id, person.id, true);
    await sponsor(second.id, person.id, true);

    expect(await wallRowsFor(person.id)).toHaveLength(1);

    await first.cleanup();
    await second.cleanup();
    await person.cleanup();
  });

  test("an organization published by hand is on the wall with no event", async () => {
    const person = await createPerson({ person_type: "organization" });
    await adminClient
      .from("people")
      .update({
        logo_url: "https://example.test/hand-published.png",
        website: "https://hand-published.example.test",
      })
      .eq("id", person.id);
    await sponsorTag(person.id, true);

    expect(await wallRowsFor(person.id)).toEqual([
      {
        sponsor_id: person.id,
        name: expect.any(String),
        logo_url: "https://example.test/hand-published.png",
        website: "https://hand-published.example.test",
      },
    ]);

    // The tag cascades with the person (20260903010000), so this is enough.
    await person.cleanup();
  });

  test("a sponsor tag not marked public stays off the wall", async () => {
    const person = await createPerson({ person_type: "organization" });
    await sponsorTag(person.id, false);

    expect(await wallRowsFor(person.id)).toEqual([]);

    await person.cleanup();
  });

  test("an individual published by hand stays off the wall", async () => {
    // The arm is organizations only: the wall shows a mark, and an individual
    // with no logo would be published as their own name.
    const person = await createPerson();
    await sponsorTag(person.id, true);

    expect(await wallRowsFor(person.id)).toEqual([]);

    await person.cleanup();
  });

  test("a sponsor both event-credited and published by hand appears once", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson({ person_type: "organization" });
    await sponsor(event.id, person.id, true);
    await sponsorTag(person.id, true);

    expect(await wallRowsFor(person.id)).toHaveLength(1);

    await event.cleanup();
    await person.cleanup();
  });

  test("a sponsor with no logo still appears, for the name fallback to render", async () => {
    const event = await createPublishedEvent();
    const person = await createPerson();
    await sponsor(event.id, person.id, true);

    const rows = await wallRowsFor(person.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].logo_url).toBeNull();
    expect(rows[0].name).toBeTruthy();

    await event.cleanup();
    await person.cleanup();
  });
});
