// Integration test (#1693): a guest reads the people on their granted event
// through event_people(), and nothing else of `people`. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  createPerson,
  createPublishedEvent,
  serviceRoleClient,
  signInAs,
  uniqueEmail,
} from "../../../test/integration-setup";
import { SEEDED_USER_IDS } from "../../../test/seed-fixtures";

type Fixture = { id: string; cleanup: () => Promise<void> };

let guest: SupabaseClient;
let coordinator: SupabaseClient;
let eventA: Fixture;
let eventB: Fixture;
let staffA: Fixture;
let volunteerA: Fixture;
let ownerA: Fixture;
let staffB: Fixture;

async function grant(eventId: string, areas: string[]) {
  const { error } = await adminClient.from("event_access_grants").insert({
    event_id: eventId,
    user_id: SEEDED_USER_IDS.noAccess,
    level: "manage",
    areas,
  });
  if (error) throw error;
}

async function eventPeople(client: SupabaseClient, eventId: string) {
  const { data, error } = await client.rpc("event_people", {
    p_event_id: eventId,
  });
  if (error) throw error;
  return (data ?? []) as {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
  }[];
}

beforeAll(async () => {
  guest = await signInAs(SEEDED_USERS.noAccess);
  coordinator = await signInAs(SEEDED_USERS.coordinator);
  eventA = await createPublishedEvent();
  eventB = await createPublishedEvent();
  staffA = await createPerson({
    name: "Staff A",
    email: uniqueEmail("staff-a"),
  });
  volunteerA = await createPerson({
    name: "Volunteer A",
    email: uniqueEmail("volunteer-a"),
  });
  ownerA = await createPerson({
    name: "Owner A",
    email: uniqueEmail("owner-a"),
  });
  staffB = await createPerson({
    name: "Staff B",
    email: uniqueEmail("staff-b"),
  });

  for (const [table, row] of [
    ["event_staff", { event_id: eventA.id, person_id: staffA.id }],
    ["event_volunteers", { event_id: eventA.id, person_id: volunteerA.id }],
    ["event_staff", { event_id: eventB.id, person_id: staffB.id }],
    [
      "event_checklist_items",
      {
        event_id: eventA.id,
        title: "Book the hall",
        owner_person_id: ownerA.id,
      },
    ],
  ] as const) {
    const { error } = await adminClient.from(table).insert(row);
    if (error) throw error;
  }
});

afterEach(async () => {
  const { error } = await serviceRoleClient()
    .from("event_access_grants")
    .delete()
    .in("event_id", [eventA.id, eventB.id]);
  if (error) throw error;
});

afterAll(async () => {
  await eventA.cleanup();
  await eventB.cleanup();
  for (const person of [staffA, volunteerA, ownerA, staffB]) {
    await person.cleanup();
  }
});

describe("event_people()", () => {
  test("a Staff grant reads its event's staff and volunteers with names and contact", async () => {
    await grant(eventA.id, ["staff"]);
    const people = await eventPeople(guest, eventA.id);
    expect(people.map((person) => person.id).sort()).toEqual(
      [staffA.id, volunteerA.id].sort(),
    );
    const staff = people.find((person) => person.id === staffA.id);
    expect(staff?.name).toBe("Staff A");
    expect(staff?.email).not.toBeNull();
  });

  test("the guest's staff list comes back with names", async () => {
    await grant(eventA.id, ["staff"]);
    // `people` itself stays shut, so the embed is null for a guest...
    const { data: rows, error } = await guest
      .from("event_staff")
      .select("person_id, person:people(id, name)")
      .eq("event_id", eventA.id);
    expect(error).toBeNull();
    expect(rows as unknown).toEqual([{ person_id: staffA.id, person: null }]);
    // ...and event_people() is what fills it.
    const names = new Map(
      (await eventPeople(guest, eventA.id)).map((p) => [p.id, p.name]),
    );
    expect(names.get(rows![0].person_id)).toBe("Staff A");
  });

  test("no people from another event", async () => {
    await grant(eventA.id, ["staff"]);
    expect(await eventPeople(guest, eventB.id)).toEqual([]);
    const ids = (await eventPeople(guest, eventA.id)).map((p) => p.id);
    expect(ids).not.toContain(staffB.id);
  });

  test("only the areas the grant covers: Details adds the checklist owner, name only", async () => {
    await grant(eventA.id, ["details"]);
    const people = await eventPeople(guest, eventA.id);
    expect(people.map((person) => person.id)).toEqual([ownerA.id]);
    expect(people[0].name).toBe("Owner A");
    expect(people[0].email).toBeNull();
    expect(people[0].phone).toBeNull();
  });

  test("a guest cannot list the directory", async () => {
    await grant(eventA.id, ["staff"]);
    const { data, error } = await guest
      .from("people")
      .select("id")
      .in("id", [staffA.id, volunteerA.id, ownerA.id, staffB.id]);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("without a grant a guest reads nobody", async () => {
    expect(await eventPeople(guest, eventA.id)).toEqual([]);
  });

  test("a role holder reads every referenced person", async () => {
    const ids = (await eventPeople(coordinator, eventA.id)).map((p) => p.id);
    expect(ids.sort()).toEqual([staffA.id, volunteerA.id, ownerA.id].sort());
  });
});
