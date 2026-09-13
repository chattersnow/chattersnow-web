// Integration coverage for notification_recipients() (#1044) against a real
// local Supabase stack.
//
// The case this file is really for is the last one. The card this RPC feeds
// answers "who gets the volunteer application notice?", and an answer that
// drifts from what submission-notifications.ts actually does is worse than no
// answer -- so the final test asserts the RPC's `receives` set *is*
// people_with_permission() intersected with the opted-in rows, rather than
// re-deriving the rule a second time and hoping the two agree.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  serviceRoleClient,
  signInAs,
} from "../../../test/integration-setup";
import { SEEDED_PERSON_IDS } from "../../../test/seed-fixtures";
import { getNotificationRecipients } from "./recipients";
import type { NotificationRecipient } from "./recipients";

const service = serviceRoleClient();
const anon = anonClient();

/** Requires volunteers:manage, which the seeded matrix gives to admin alone. */
const ROLE_KIND = "volunteer_application";
/** No `requires` at all: whoever opted in receives it. */
const OPEN_KIND = "task_digest";
/** Requires artwork_submissions:manage, and nobody here opts in to it. */
const UNSUBSCRIBED_KIND = "artwork_submission";

// Jamie Rivera, a seeded donor: a person with no account at all, so they can
// never hold a role -- which makes them the clean case for "opted in, but has
// no role that receives this".
const DONOR_WITHOUT_AN_ACCOUNT = SEEDED_PERSON_IDS.donor1;

let chatterTenantId: string;
let adminPersonId: string;
let coordinatorPersonId: string;
let otherTenantId: string;
let otherPersonId: string;

/** Every row the panel would render, keyed by kind. */
async function recipients() {
  const byKind = await getNotificationRecipients(adminClient);
  if (byKind === null) throw new Error("the recipients read failed");
  return byKind;
}

const find = (people: NotificationRecipient[], personId: string) =>
  people.find((person) => person.personId === personId);

beforeAll(async () => {
  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (tenantError) throw tenantError;
  chatterTenantId = tenant.id as string;

  const { data: people, error: peopleError } = await service
    .from("people")
    .select("id, email")
    .eq("tenant_id", chatterTenantId)
    .in("email", [SEEDED_USERS.admin, SEEDED_USERS.coordinator]);
  if (peopleError) throw peopleError;
  const byEmail = new Map(
    (people ?? []).map((row) => [row.email as string, row.id as string]),
  );
  adminPersonId = byEmail.get(SEEDED_USERS.admin)!;
  coordinatorPersonId = byEmail.get(SEEDED_USERS.coordinator)!;

  // Archived, not active, for the same reason the two files beside this one
  // make theirs archived: a second *active* tenant would knock
  // default_tenant_id() off its sole-tenant fallback for every other
  // integration file sharing this database.
  const { data: other, error: otherError } = await service
    .from("tenants")
    .insert({
      name: "Recipients Test Org",
      slug: `recip-${crypto.randomUUID().slice(0, 8)}`,
      status: "archived",
    })
    .select("id")
    .single();
  if (otherError) throw otherError;
  otherTenantId = other.id as string;

  const { data: otherPerson, error: otherPersonError } = await service
    .from("people")
    .insert({
      tenant_id: otherTenantId,
      name: "Other Tenant Recipient",
      email: `recip-other-${crypto.randomUUID().slice(0, 8)}@example.test`,
      source_type: "individual",
    })
    .select("id")
    .single();
  if (otherPersonError) throw otherPersonError;
  otherPersonId = otherPerson.id as string;

  // The three opt-ins the cases below read. The admin holds the role for the
  // first; the coordinator holds volunteers:view only; the donor holds nothing.
  const { error: prefError } = await service
    .from("person_notification_preferences")
    .insert([
      {
        tenant_id: chatterTenantId,
        person_id: adminPersonId,
        kind: ROLE_KIND,
        enabled: true,
      },
      {
        tenant_id: chatterTenantId,
        person_id: coordinatorPersonId,
        kind: ROLE_KIND,
        enabled: true,
      },
      {
        tenant_id: chatterTenantId,
        person_id: DONOR_WITHOUT_AN_ACCOUNT,
        kind: OPEN_KIND,
        enabled: true,
      },
      {
        tenant_id: otherTenantId,
        person_id: otherPersonId,
        kind: ROLE_KIND,
        enabled: true,
      },
    ]);
  if (prefError) throw prefError;
});

afterAll(async () => {
  // Row by row, by (person, kind): supabase/seed.sql opts the admin's own
  // person in to task_digest and other files read that row, so a delete by
  // person alone would take it with them.
  for (const [personId, kind] of [
    [adminPersonId, ROLE_KIND],
    [coordinatorPersonId, ROLE_KIND],
    [DONOR_WITHOUT_AN_ACCOUNT, OPEN_KIND],
    [otherPersonId, ROLE_KIND],
  ] as const) {
    await service
      .from("person_notification_preferences")
      .delete()
      .eq("person_id", personId)
      .eq("kind", kind);
  }
  await service.from("people").delete().eq("id", otherPersonId);
  // Since #707 Phase 5b a trigger on tenants seeds every new tenant's
  // retention rules, and that foreign key is `no action` like every other one
  // to tenants -- so these go first or the tenant survives the run and the
  // next file to read a per-tenant table as service_role sees two.
  await service
    .from("retention_policies")
    .delete()
    .eq("tenant_id", otherTenantId);
  const { error } = await service
    .from("tenants")
    .delete()
    .eq("id", otherTenantId);
  if (error) throw error;
});

describe("who may call it", () => {
  test("an administrator may", async () => {
    const { error } = await adminClient.rpc("notification_recipients", {
      p_kinds: [{ kind: OPEN_KIND, resources: null, level: null }],
    });
    expect(error).toBeNull();
  });

  test("a volunteer may not", async () => {
    const volunteer = await signInAs(SEEDED_USERS.volunteer);
    const { error } = await volunteer.rpc("notification_recipients", {
      p_kinds: [{ kind: OPEN_KIND, resources: null, level: null }],
    });
    expect(error?.message).toContain("NOT_AUTHORIZED");
  });

  test("a coordinator, who can see the volunteer queue, may not", async () => {
    // volunteers:view is not administration:manage. Reading every person's
    // address and every person's opt-in is an administration concern.
    const coordinator = await signInAs(SEEDED_USERS.coordinator);
    const { error } = await coordinator.rpc("notification_recipients", {
      p_kinds: [
        { kind: ROLE_KIND, resources: ["volunteers"], level: "manage" },
      ],
    });
    expect(error?.message).toContain("NOT_AUTHORIZED");
  });

  test("an anonymous visitor may not", async () => {
    const { error } = await anon.rpc("notification_recipients", {
      p_kinds: [{ kind: OPEN_KIND, resources: null, level: null }],
    });
    expect(error).not.toBeNull();
  });
});

describe("what it reports", () => {
  test("a role holder who opted in receives it", async () => {
    const admin = find((await recipients())[ROLE_KIND] ?? [], adminPersonId);
    expect(admin).toMatchObject({
      optedIn: true,
      holdsRole: true,
      receives: true,
    });
  });

  test("an opt-in without the role is listed, and receives nothing", async () => {
    // The point of the card: this person turned the switch on and gets nothing,
    // which was silent everywhere before.
    const coordinator = find(
      (await recipients())[ROLE_KIND] ?? [],
      coordinatorPersonId,
    );
    expect(coordinator).toMatchObject({
      optedIn: true,
      holdsRole: false,
      receives: false,
    });
  });

  test("a role holder who never opted in is listed, and receives nothing", async () => {
    // The other gap. The admin holds artwork_submissions:manage and has no
    // preference row for it, so the queue's notices reach nobody.
    const admin = find(
      (await recipients())[UNSUBSCRIBED_KIND] ?? [],
      adminPersonId,
    );
    expect(admin).toMatchObject({
      optedIn: false,
      holdsRole: true,
      receives: false,
    });
  });

  test("a kind with no role requirement counts an opt-in on its own", async () => {
    // The donor has no account and could never hold a role, and the task digest
    // is addressed to whoever owns the action item rather than to a role.
    const donor = find(
      (await recipients())[OPEN_KIND] ?? [],
      DONOR_WITHOUT_AN_ACCOUNT,
    );
    expect(donor).toMatchObject({
      optedIn: true,
      holdsRole: true,
      receives: true,
    });
  });

  test("another tenant's opt-in never appears", async () => {
    const everyone = Object.values(await recipients()).flat();
    expect(everyone.map((person) => person.personId)).not.toContain(
      otherPersonId,
    );
  });
});

describe("it cannot drift from the senders", () => {
  test("receives is people_with_permission intersected with the opt-ins", async () => {
    // Resolved twice, independently: once through the RPC the card reads, once
    // through the two things the sender itself calls.
    const { data: holders, error: holdersError } = await service.rpc(
      "people_with_permission",
      {
        p_tenant_id: chatterTenantId,
        p_resource_keys: ["volunteers"],
        p_min_level: "manage",
      },
    );
    if (holdersError) throw holdersError;

    const { data: optIns, error: optInError } = await service
      .from("person_notification_preferences")
      .select("person_id")
      .eq("tenant_id", chatterTenantId)
      .eq("kind", ROLE_KIND)
      .eq("enabled", true);
    if (optInError) throw optInError;

    const optedIn = new Set(
      (optIns ?? []).map((row) => row.person_id as string),
    );
    const expected = ((holders ?? []) as { person_id: string }[])
      .map((row) => row.person_id)
      .filter((personId) => optedIn.has(personId))
      .sort();

    const reported = ((await recipients())[ROLE_KIND] ?? [])
      .filter((person) => person.receives)
      .map((person) => person.personId)
      .sort();

    expect(reported).toEqual(expected);
    // Not vacuous: the fixtures above put somebody in that intersection.
    expect(reported).toContain(adminPersonId);
  });
});
