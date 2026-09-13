// Integration test: the `public_team` view behind Meet the Team's People mode
// (#1014), and the `public_team_members` table under it. Mocks nothing -- the
// point is what `anon` actually gets back, since the view is security definer
// and its own predicates are the only thing between the public page and the
// `people` directory. Cross-tenant isolation is covered separately, with a
// marker row in two tenants, by src/lib/portal/tenant-isolation.integration.test.ts.
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, test } from "bun:test";
import {
  adminClient,
  anonClient,
  createPerson,
  unprivilegedActors,
} from "../../../../../test/integration-setup";

type TeamRow = {
  id: string;
  name: string;
  role: string | null;
  photo_url: string | null;
  bio: string | null;
  sort_order: number | null;
};

async function list(
  personId: string,
  fields: Partial<{
    public_role: string | null;
    photo_url: string | null;
    bio: string | null;
    sort_order: number | null;
  }> = {},
): Promise<string> {
  const { data, error } = await adminClient
    .from("public_team_members")
    .insert({ person_id: personId, ...fields })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function teamRowsFor(id: string): Promise<TeamRow[]> {
  const { data, error } = await anonClient()
    .from("public_team")
    .select("*")
    .eq("id", id);
  if (error) throw error;
  return (data ?? []) as TeamRow[];
}

describe("public_team (integration)", () => {
  test("a listed person is on the page with exactly the public fields", async () => {
    const person = await createPerson({ name: "Rowan Integration" });
    const id = await list(person.id, {
      public_role: "Programs lead",
      photo_url: "https://example.test/rowan.jpg",
      bio: "First.\n\nSecond.",
      sort_order: 1,
    });

    const rows = await teamRowsFor(id);
    expect(rows).toEqual([
      {
        id,
        name: "Rowan Integration",
        role: "Programs lead",
        photo_url: "https://example.test/rowan.jpg",
        bio: "First.\n\nSecond.",
        sort_order: 1,
      },
    ]);
    // `select("*")` above: the column list is the whole contract. No
    // person_id, no email, no phone, no notes, no audit columns.
    expect(Object.keys(rows[0]).sort()).toEqual([
      "bio",
      "id",
      "name",
      "photo_url",
      "role",
      "sort_order",
    ]);
    await person.cleanup();
  });

  test("the preferred name is what the page shows", async () => {
    const person = await createPerson({ name: "Rowan Integration" });
    await adminClient
      .from("people")
      .update({ preferred_name: "Ro" })
      .eq("id", person.id);
    const id = await list(person.id);

    expect((await teamRowsFor(id)).map((row) => row.name)).toEqual(["Ro"]);
    await person.cleanup();
  });

  test("a person with no listing is not on the page, and removing the listing removes them", async () => {
    const person = await createPerson();
    const { data: before } = await anonClient()
      .from("public_team")
      .select("id")
      .eq("name", person.id);
    expect(before).toEqual([]);

    const id = await list(person.id);
    expect(await teamRowsFor(id)).toHaveLength(1);

    await adminClient.from("public_team_members").delete().eq("id", id);
    expect(await teamRowsFor(id)).toEqual([]);
    await person.cleanup();
  });

  test("deleting the person takes the listing with them", async () => {
    const person = await createPerson();
    const id = await list(person.id);
    await person.cleanup();

    expect(await teamRowsFor(id)).toEqual([]);
    const { data } = await adminClient
      .from("public_team_members")
      .select("id")
      .eq("id", id);
    expect(data).toEqual([]);
  });

  test("one listing per person", async () => {
    const person = await createPerson();
    await list(person.id);
    const { error } = await adminClient
      .from("public_team_members")
      .insert({ person_id: person.id });
    expect(error?.code).toBe("23505");
    await person.cleanup();
  });

  test("a photo link that is not http(s) is refused by the table", async () => {
    const person = await createPerson();
    const { error } = await adminClient
      .from("public_team_members")
      .insert({ person_id: person.id, photo_url: "example.test/x.jpg" });
    expect(error?.code).toBe("23514");
    await person.cleanup();
  });

  test("nobody without people:manage can list, change or remove a person", async () => {
    const person = await createPerson();
    const id = await list(person.id, { public_role: "Before" });

    for (const actor of await unprivilegedActors()) {
      const inserted = await actor.client
        .from("public_team_members")
        .insert({ person_id: person.id });
      expect(inserted.error, `${actor.name} insert`).not.toBeNull();

      const { data: updated } = await actor.client
        .from("public_team_members")
        .update({ public_role: "After" })
        .eq("id", id)
        .select("id");
      expect(updated ?? [], `${actor.name} update`).toEqual([]);

      const { data: deleted } = await actor.client
        .from("public_team_members")
        .delete()
        .eq("id", id)
        .select("id");
      expect(deleted ?? [], `${actor.name} delete`).toEqual([]);

      // And the table itself, as opposed to the view, is not readable.
      const { data: read } = await actor.client
        .from("public_team_members")
        .select("id")
        .eq("id", id);
      expect(read ?? [], `${actor.name} select`).toEqual([]);
    }

    expect((await teamRowsFor(id)).map((row) => row.role)).toEqual(["Before"]);
    await person.cleanup();
  });
});
