// Reading your own history as a constituent (#1163), against a real local
// stack.
//
// The whole point of this file is the access path, not the queries. Every
// table behind `/my` is RLS-gated on a permission a constituent will never
// hold, so the four `my_*_history()` functions are security definer -- which
// means the isolation nobody can see in a policy has to be proven here
// instead:
//
//   1. The functions take no person id, so one constituent asking for
//      another's history has nothing to ask with. Proven by signing in as
//      each of two people and reading what comes back.
//   2. They resolve their tenant from the request host, so a record the same
//      account holds in another organization stays there.
//   3. They consult no permission at all, so an administrator -- the easiest
//      account to develop against, and the one most likely to hide a scoping
//      bug -- sees their own history and nobody else's.
//   4. A module the tenant has switched off returns no rows, not a hidden
//      section. The gate is in the database because the page is not what
//      stops a curl request.
//
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MyEventRegistration,
  MyGearEntry,
  MyGivingEntry,
  MyVolunteerEntry,
} from "./history";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createAvailableGearItems,
  createDonation,
  createMonetaryDonation,
  createPublishedEvent,
  enableModule,
  seededTenantId,
  serviceRoleClient,
  signIn,
  tenantToday,
  uniqueEmail,
  withModule,
} from "../../../test/integration-setup";

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);

type Constituent = {
  client: SupabaseClient;
  userId: string;
  personId: string;
  email: string;
};

let tenantId: string;
let otherTenantId: string;
let restoreModule: () => Promise<void>;
let alice: Constituent;
let bob: Constituent;
let eventId: string;
let adminPersonId: string;

const cleanups: (() => Promise<void>)[] = [];

/**
 * A signed-in account with no tenant membership, linked to a directory record
 * -- which is what a claim approved by `review_person_claim()` leaves behind,
 * created directly here because #1162 already tests the claim itself.
 */
async function makeConstituent(tag: string): Promise<Constituent> {
  const email = uniqueEmail(`${tag}-${run}`);
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user!.id;

  const { data: person, error: personError } = await service
    .from("people")
    .insert({
      tenant_id: tenantId,
      name: `${tag} Constituent ${run}`,
      source_type: "other",
      email,
      auth_user_id: userId,
    })
    .select("id")
    .single();
  if (personError) throw new Error(`person: ${personError.message}`);

  cleanups.push(async () => {
    await service.from("people").delete().eq("id", person.id);
  });

  return { client: await signIn(email), userId, personId: person.id, email };
}

/** Everything one person can have on their record, in one go. */
async function giveHistoryTo(personId: string, label: string) {
  const { error: registrationError } = await adminClient
    .from("event_registrations")
    .insert({
      event_id: eventId,
      person_id: personId,
      name: label,
      email: uniqueEmail(`reg-${label}-${run}`),
      party_size: 2,
      checked_in_at: new Date().toISOString(),
    });
  if (registrationError) throw new Error(registrationError.message);

  const { error: hoursError } = await adminClient
    .from("volunteer_hours")
    .insert({
      person_id: personId,
      event_id: eventId,
      hours: 3,
      logged_date: tenantToday(),
    });
  if (hoursError) throw new Error(hoursError.message);

  const { error: signupError } = await adminClient
    .from("event_volunteers")
    .insert({
      event_id: eventId,
      person_id: personId,
      role: `Fitter ${label}`,
    });
  if (signupError) throw new Error(signupError.message);

  // Applications arrive through an anon RPC and `authenticated` holds no
  // insert on the table, so this one goes in as service role. Same reason as
  // the gear request below: what is under test is the read.
  const { error: applicationError } = await service
    .from("volunteer_applications")
    .insert({
      tenant_id: tenantId,
      person_id: personId,
      name: label,
      email: uniqueEmail(`app-${label}-${run}`),
      reference_code: `VA-${label}-${run}`.slice(0, 20),
      role_interest: `Fitter ${label}`,
      status: "new",
    });
  if (applicationError) throw new Error(applicationError.message);

  // An in-kind donation with a real item on it, so the section has something
  // to name. create_donation_with_items() makes its own donor; moving the row
  // is cheaper than reproducing the RPC's insert.
  //
  // Its cleanup goes first in the list, which means *last* of this person's --
  // `cleanupDonation` ends by deleting the donation's donor, and by then that
  // is this person, so everything else pointing at them has to be gone.
  const donation = await createDonation();
  cleanups.push(donation.cleanup);
  cleanups.push(async () => {
    await service
      .from("volunteer_applications")
      .delete()
      .eq("person_id", personId);
  });
  const { error: donorError } = await service
    .from("donations")
    .update({ donor_id: personId })
    .eq("id", donation.id);
  if (donorError) throw new Error(donorError.message);

  const gift = await createMonetaryDonation({ donorId: personId, amount: 42 });
  cleanups.push(gift.cleanup);

  // gear_requests has no insert policy at all -- `request_gear_items()` is the
  // only writer, and it matches its own person by email. Service role, since
  // the request under test is the read.
  const { error: requestError } = await service.from("gear_requests").insert({
    tenant_id: tenantId,
    person_id: personId,
    delivery_method: "meetup",
    status: "new",
    notes: `Size 10 for ${label}`,
  });
  if (requestError) throw new Error(requestError.message);
  cleanups.push(async () => {
    await service.from("gear_requests").delete().eq("person_id", personId);
  });

  const items = await createAvailableGearItems(1);
  const { error: movementError } = await adminClient
    .from("inventory_movements")
    .insert({
      inventory_item_id: items.itemIds[0],
      recipient_person_id: personId,
      movement_type: "distributed",
      quantity: 1,
    });
  if (movementError) throw new Error(movementError.message);
  cleanups.push(async () => {
    await adminClient
      .from("inventory_movements")
      .delete()
      .eq("recipient_person_id", personId);
    await items.cleanup();
  });
}

/**
 * One module off for the duration of a test, then back to exactly what was
 * there. Every module has a row on the seeded tenant, so "off, then deleted"
 * is not a round trip -- it drops the tenant to the catalog default and leaves
 * the run's own state behind it (#1282).
 */
function withModuleOff(key: string, body: () => Promise<void>) {
  return withModule(tenantId, key, false, body);
}

beforeAll(async () => {
  tenantId = await seededTenantId();

  // The area is a module a tenant opts into, and it ships off everywhere
  // (#1161). A tenant actually using this has it on, so the fixtures do; the
  // off case is its own test below rather than the ambient state.
  restoreModule = await enableModule(tenantId, "constituent_accounts");

  const event = await createPublishedEvent({ name: `History event ${run}` });
  eventId = event.id;

  alice = await makeConstituent("alice");
  bob = await makeConstituent("bob");
  await giveHistoryTo(alice.personId, "alice");
  await giveHistoryTo(bob.personId, "bob");

  // supabase/seed.sql gives the staff accounts a directory record at their own
  // address, so the administrator has a person of their own to have a history
  // on.
  const { data: adminPerson, error: adminPersonError } = await service
    .from("people")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("email", SEEDED_USERS.admin)
    .single();
  if (adminPersonError) throw new Error(adminPersonError.message);
  adminPersonId = adminPerson.id as string;

  // Cleanup runs last-in-first-out, so the event goes after its children.
  cleanups.push(event.cleanup);
});

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  await restoreModule();
  if (otherTenantId) {
    await service.rpc("delete_tenant", { p_tenant_id: otherTenantId });
  }
});

/**
 * The four sections, named once.
 *
 * Every "is it empty" case below loops over this, because a rule that holds
 * for one section and not another is the bug these tests are for.
 */
const SECTIONS = [
  "my_event_history",
  "my_volunteer_history",
  "my_giving_history",
  "my_gear_history",
] as const;

/**
 * One section, read as an account, typed the way the page types it.
 *
 * `src/lib/database.types.ts` calls every result column of a `returns table`
 * function non-null -- Postgres carries no nullability through one -- so the
 * row shapes the page believes (`./history`) are what this file asserts
 * against too, and a drift between them shows up here.
 */
async function sectionOf<T>(
  client: SupabaseClient,
  rpc: (typeof SECTIONS)[number],
): Promise<T[]> {
  const { data, error } = await client.rpc(rpc);
  expect(error).toBeNull();
  return (data ?? []) as T[];
}

describe("a linked constituent reads their own record", () => {
  test("every section comes back, and only their own rows are in it", async () => {
    const events = await sectionOf<MyEventRegistration>(
      alice.client,
      "my_event_history",
    );
    expect(events).toHaveLength(1);
    expect(events[0].event_id).toBe(eventId);
    expect(events[0].attended).toBe(true);
    expect(events[0].party_size).toBe(2);

    const volunteering = await sectionOf<MyVolunteerEntry>(
      alice.client,
      "my_volunteer_history",
    );
    expect(volunteering.map((row) => row.kind).sort()).toEqual([
      "application",
      "hours",
      "signup",
    ]);
    expect(volunteering.find((row) => row.kind === "application")!.role).toBe(
      "Fitter alice",
    );
    // Hours logged with no role type of their own fall back to what this
    // person signed up as for that same event.
    expect(volunteering.find((row) => row.kind === "hours")!.role).toBe(
      "Fitter alice",
    );

    const giving = await sectionOf<MyGivingEntry>(
      alice.client,
      "my_giving_history",
    );
    expect(giving.map((row) => row.kind).sort()).toEqual([
      "in_kind",
      "monetary",
    ]);
    expect(Number(giving.find((row) => row.kind === "monetary")!.amount)).toBe(
      42,
    );
    expect(giving.find((row) => row.kind === "in_kind")!.items).toHaveLength(1);

    const gear = await sectionOf<MyGearEntry>(alice.client, "my_gear_history");
    expect(gear.map((row) => row.kind).sort()).toEqual(["received", "request"]);
    expect(gear.find((row) => row.kind === "request")!.note).toBe(
      "Size 10 for alice",
    );
  });

  test("nothing staff write about a record reaches the person it is about", async () => {
    // The staff columns each section deliberately leaves behind. A future
    // column added to one of these RPCs has to argue with this list.
    const gear = await sectionOf<MyGearEntry>(alice.client, "my_gear_history");
    const request = gear.find((row) => row.kind === "request")!;
    expect(request).not.toHaveProperty("ship_line1");
    expect(request).not.toHaveProperty("updated_by");

    const received = gear.find((row) => row.kind === "received")!;
    expect(received).not.toHaveProperty("reason");
    expect(received).not.toHaveProperty("created_by");

    const giving = await sectionOf<MyGivingEntry>(
      alice.client,
      "my_giving_history",
    );
    for (const row of giving) {
      expect(row).not.toHaveProperty("notes");
      expect(row).not.toHaveProperty("created_by");
    }
  });
});

describe("one constituent and another", () => {
  test("neither can obtain the other's history through any of the four", async () => {
    for (const rpc of SECTIONS) {
      const rows = await sectionOf<unknown>(alice.client, rpc);
      expect(rows.length).toBeGreaterThan(0);
      // Bob's fixtures are the same shape as Alice's and just as numerous, so
      // "only mine" is a real claim here rather than an artefact of an empty
      // second account.
      expect(JSON.stringify(rows)).not.toContain("bob");
    }

    const bobsGear = await sectionOf<MyGearEntry>(
      bob.client,
      "my_gear_history",
    );
    expect(bobsGear.find((row) => row.kind === "request")!.note).toBe(
      "Size 10 for bob",
    );
    expect(JSON.stringify(bobsGear)).not.toContain("alice");
  });

  test("there is no argument to ask with", async () => {
    // PostgREST refuses an argument the function does not declare, which is
    // the shape of the guarantee: not "the id is checked" but "there is no id".
    const attempt = await alice.client.rpc("my_giving_history", {
      p_person_id: bob.personId,
    } as never);
    expect(attempt.error).not.toBeNull();
  });
});

describe("another organization's rows", () => {
  test("stay there, even for the same account", async () => {
    const { data: tenant, error: tenantError } = await service
      .from("tenants")
      .insert({
        name: "Other Org",
        slug: `other-${run}`,
        // Archived: this file needs a second tenant only to exist, and a
        // second *active* one would knock public_tenant_id() off its
        // sole-tenant fallback for every other integration file sharing this
        // database.
        status: "archived",
      })
      .select("id")
      .single();
    if (tenantError) throw new Error(tenantError.message);
    otherTenantId = tenant.id;

    const { data: person, error: personError } = await service
      .from("people")
      .insert({
        tenant_id: otherTenantId,
        name: `Alice Elsewhere ${run}`,
        source_type: "other",
        auth_user_id: alice.userId,
      })
      .select("id")
      .single();
    if (personError) throw new Error(personError.message);

    const { error: giftError } = await service
      .from("monetary_donations")
      .insert({
        tenant_id: otherTenantId,
        donor_id: person.id,
        amount: 999,
        method: "cash",
        received_date: tenantToday(),
        // `created_by` defaults to auth.uid(), which is null for service role.
        created_by: alice.userId,
      });
    if (giftError) throw new Error(giftError.message);

    const giving = await sectionOf<MyGivingEntry>(
      alice.client,
      "my_giving_history",
    );
    expect(giving.map((row) => Number(row.amount ?? 0))).not.toContain(999);
  });
});

describe("the permissions the reader holds", () => {
  test("make no difference: an administrator reads their own history", async () => {
    // Give the administrator's own record something, so "the admin sees
    // nothing" cannot pass this test by accident.
    const gift = await createMonetaryDonation({
      donorId: adminPersonId,
      amount: 7,
    });
    cleanups.push(gift.cleanup);

    const giving = await sectionOf<MyGivingEntry>(
      await signIn(SEEDED_USERS.admin),
      "my_giving_history",
    );
    const amounts = giving.map((row) => Number(row.amount ?? 0));
    expect(amounts).toContain(7);
    // `finance:manage` reads every donation in the portal and not one more
    // here: Alice's 42 belongs to Alice.
    expect(amounts).not.toContain(42);
  });
});

describe("module entitlements", () => {
  test("a section whose module is off returns nothing", async () => {
    await withModuleOff("events", async () => {
      expect(await sectionOf(alice.client, "my_event_history")).toEqual([]);
      // And only that section: volunteering is its own module.
      expect(
        (await sectionOf(alice.client, "my_volunteer_history")).length,
      ).toBeGreaterThan(0);
    });
  });

  test("giving splits by module, because it is two of them", async () => {
    await withModuleOff("finance", async () => {
      const giving = await sectionOf<MyGivingEntry>(
        alice.client,
        "my_giving_history",
      );
      expect(giving.map((row) => row.kind)).toEqual(["in_kind"]);
    });
  });

  test("with the constituent area off, every section is empty", async () => {
    await withModuleOff("constituent_accounts", async () => {
      for (const rpc of SECTIONS) {
        expect(await sectionOf(alice.client, rpc)).toEqual([]);
      }
    });
  });
});

describe("an account with no record", () => {
  test("reads nothing rather than everything", async () => {
    const email = uniqueEmail(`stranger-${run}`);
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: "password123",
      email_confirm: true,
    });
    if (error) throw error;
    expect(data.user).not.toBeNull();

    const stranger = await signIn(email);
    for (const rpc of SECTIONS) {
      expect(await sectionOf(stranger, rpc)).toEqual([]);
    }
  });
});

describe("signed out", () => {
  test("cannot execute any of them", async () => {
    const anon = anonClient();
    for (const rpc of SECTIONS) {
      const result = await anon.rpc(rpc);
      expect(result.error).not.toBeNull();
    }
  });
});
