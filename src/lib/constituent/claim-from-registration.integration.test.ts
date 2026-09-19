// Claiming a record from the registration that just created it (#1258),
// against a real local stack.
//
// The claim itself is #1162's, and `claims.integration.test.ts` covers what it
// is made of. What is new here is where the evidence comes from: a
// registration row rather than a form. So this file is about the two halves
// that differ -- the fields are copied as typed and reach the reviewer's queue
// at tier 1, and every way the copy can fail is silent.
//
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  anonClient,
  createPublishedEvent,
  serviceRoleClient,
  signIn,
  uniqueEmail,
  uniqueIp,
} from "../../../test/integration-setup";

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);

let tenantId: string;
let eventId: string;
let eventName: string;
let eventCleanup: () => Promise<void>;
/** The tenant's own module row as this file found it, or null if it had none. */
let moduleWasEnabled: boolean | null = null;

const createdUsers: string[] = [];
const createdPeople: string[] = [];

/** A signed-in account with no tenant membership: a constituent. */
async function makeConstituent(email: string): Promise<{
  client: SupabaseClient;
  userId: string;
}> {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: "password123",
    email_confirm: true,
  });
  if (error) throw error;
  createdUsers.push(data.user!.id);
  return { client: await signIn(email), userId: data.user!.id };
}

/**
 * A registration exactly as `register_for_event()` leaves one: a `people` row
 * matched or minted, and the row itself holding what was typed.
 */
async function registration(fields: {
  name: string;
  email: string;
  phone?: string | null;
  instagramHandle?: string | null;
  createdAt?: string;
  eventId?: string;
}): Promise<string> {
  // Matched by address before it is minted, which is what register_for_event()
  // does -- and what `people_email_key` insists on: a second registration at
  // the same address attaches to the record the first one created.
  const { data: existing } = await service
    .from("people")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("email", fields.email)
    .maybeSingle();

  let personId = existing?.id as string | undefined;
  if (!personId) {
    const { data: personRow, error: personError } = await service
      .from("people")
      .insert({
        tenant_id: tenantId,
        source_type: "other",
        name: fields.name,
        email: fields.email,
        instagram_handle: fields.instagramHandle ?? null,
      })
      .select("id")
      .single();
    if (personError) throw new Error(`person: ${personError.message}`);
    personId = personRow.id as string;
    createdPeople.push(personId);
  }

  const { data, error } = await service
    .from("event_registrations")
    .insert({
      tenant_id: tenantId,
      event_id: fields.eventId ?? eventId,
      person_id: personId,
      name: fields.name,
      email: fields.email,
      phone: fields.phone ?? null,
      instagram_handle: fields.instagramHandle ?? null,
      ...(fields.createdAt ? { created_at: fields.createdAt } : {}),
    })
    .select("id")
    .single();
  if (error) throw new Error(`registration: ${error.message}`);
  return data.id;
}

async function claimsFor(userId: string) {
  const { data } = await service
    .from("person_claims")
    .select(
      "id, stated_name, stated_email, stated_phone, stated_instagram_handle, note, status, claimed_person_id",
    )
    .eq("auth_user_id", userId);
  return data ?? [];
}

beforeAll(async () => {
  const { data } = await service
    .from("tenants")
    .select("id")
    .eq("slug", "example-nonprofit")
    .single();
  tenantId = data!.id;

  // `constituent_accounts` is the one module in the catalog that defaults to
  // off, and a tenant actually using this has it on. The off case is a test of
  // its own below rather than the ambient state.
  //
  // The seed already turns it on for this tenant (#1175), which is what lets
  // `/my` and the e2e specs exist locally -- so this restores whatever it found
  // rather than deleting the row afterwards. Deleting it leaves the local stack
  // with the area off, and the next `bun run test:e2e` fails on a 404 nobody
  // changed the code to cause.
  const { data: before } = await service
    .from("tenant_modules")
    .select("enabled")
    .eq("tenant_id", tenantId)
    .eq("module_key", "constituent_accounts")
    .maybeSingle();
  moduleWasEnabled = before?.enabled ?? null;

  const { error: moduleError } = await service.from("tenant_modules").upsert(
    {
      tenant_id: tenantId,
      module_key: "constituent_accounts",
      enabled: true,
    },
    { onConflict: "tenant_id,module_key" },
  );
  if (moduleError) throw new Error(`enable module: ${moduleError.message}`);

  const event = await createPublishedEvent({
    name: `Claim source event ${run}`,
  });
  eventId = event.id;
  eventName = event.name;
  eventCleanup = event.cleanup;
});

afterAll(async () => {
  await service.from("person_claims").delete().in("auth_user_id", createdUsers);
  await eventCleanup();
  await service.from("people").delete().in("id", createdPeople);

  if (moduleWasEnabled === null) {
    await service
      .from("tenant_modules")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("module_key", "constituent_accounts");
  } else {
    await service
      .from("tenant_modules")
      .update({ enabled: moduleWasEnabled })
      .eq("tenant_id", tenantId)
      .eq("module_key", "constituent_accounts");
  }
});

describe("claiming from a registration", () => {
  test("copies what was typed, and says which event it came from", async () => {
    const email = uniqueEmail(`typed-${run}`);
    const { client, userId } = await makeConstituent(email);
    const registrationId = await registration({
      name: "  Robin Ashford  ",
      email,
      phone: "555-0148",
      instagramHandle: "Robin.Ashford",
    });

    const { error } = await client.rpc("submit_claim_from_registration", {
      p_registration_id: registrationId,
    });
    expect(error).toBeNull();

    const claims = await claimsFor(userId);
    expect(claims).toHaveLength(1);
    expect(claims[0].stated_name).toBe("Robin Ashford");
    expect(claims[0].stated_email).toBe(email);
    expect(claims[0].stated_phone).toBe("555-0148");
    // Normalized the one way a handle always is, so the reviewer's Instagram
    // tier can compare it against a record's.
    expect(claims[0].stated_instagram_handle).toBe("robin.ashford");
    expect(claims[0].note).toContain(eventName);
    expect(claims[0].status).toBe("pending");
    // The registration knows which record it attached to; the claim does not
    // name it, because nobody picked it. That is the reviewer's decision.
    expect(claims[0].claimed_person_id).toBeNull();
  });

  test("puts the registration's own record first on the reviewer's queue", async () => {
    const email = uniqueEmail(`ranked-${run}`);
    const { client, userId } = await makeConstituent(email);
    const registrationId = await registration({ name: `Ranked ${run}`, email });

    await client.rpc("submit_claim_from_registration", {
      p_registration_id: registrationId,
    });
    const claims = await claimsFor(userId);

    const { data, error } = await adminClient.rpc("person_claim_candidates", {
      p_claim_id: claims[0].id,
    });
    if (error) throw new Error(`candidates: ${error.message}`);
    const rows = data as { person_id: string; tier: string }[];

    // The account's verified address is the registration's, and the
    // registration wrote it onto the record it matched or minted -- so the
    // record it attached to is the tier-1 candidate, with no change to
    // person_claim_candidates() at all.
    expect(rows[0].tier).toBe("email");
    expect(createdPeople).toContain(rows[0].person_id);
  });

  test("a registration nobody made, and one from last month, are both silence", async () => {
    const { client, userId } = await makeConstituent(uniqueEmail(`old-${run}`));
    const stale = await registration({
      name: "Stale Registrant",
      email: uniqueEmail(`stale-${run}`),
      createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    });

    const missing = await client.rpc("submit_claim_from_registration", {
      p_registration_id: crypto.randomUUID(),
    });
    const expired = await client.rpc("submit_claim_from_registration", {
      p_registration_id: stale,
    });

    // Identical in every observable way, and neither wrote anything: an id
    // that names nothing must not be distinguishable from one that does.
    expect(missing.error).toBeNull();
    expect(expired.error).toBeNull();
    expect(missing.data).toEqual(expired.data);
    expect(await claimsFor(userId)).toHaveLength(0);
  });

  test("a second registration while a claim is open leaves the first alone", async () => {
    const email = uniqueEmail(`twice-${run}`);
    const { client, userId } = await makeConstituent(email);
    const first = await registration({ name: "First Time", email });
    // A second event, because one address registers once per event: this is
    // the same person signing up for the next thing while their claim waits.
    const nextEvent = await createPublishedEvent({
      name: `Second claim source event ${run}`,
    });
    const second = await registration({
      name: "Second Time",
      email,
      eventId: nextEvent.id,
    });

    await client.rpc("submit_claim_from_registration", {
      p_registration_id: first,
    });
    const { error } = await client.rpc("submit_claim_from_registration", {
      p_registration_id: second,
    });
    expect(error).toBeNull();

    const claims = await claimsFor(userId);
    expect(claims).toHaveLength(1);
    expect(claims[0].stated_name).toBe("First Time");

    await nextEvent.cleanup();
  });

  test("an account already linked to a record has nothing to claim", async () => {
    const email = uniqueEmail(`linked-${run}`);
    const { client, userId } = await makeConstituent(email);
    const registrationId = await registration({
      name: "Already Linked",
      email,
    });

    const { data: personRow } = await service
      .from("people")
      .insert({
        tenant_id: tenantId,
        source_type: "other",
        name: "Already Linked",
        auth_user_id: userId,
      })
      .select("id")
      .single();
    createdPeople.push(personRow!.id);

    const { error } = await client.rpc("submit_claim_from_registration", {
      p_registration_id: registrationId,
    });
    expect(error).toBeNull();
    expect(await claimsFor(userId)).toHaveLength(0);
  });

  test("writes nothing on a tenant without the constituent area", async () => {
    const email = uniqueEmail(`module-off-${run}`);
    const { client, userId } = await makeConstituent(email);
    const registrationId = await registration({ name: "Module Off", email });

    await service
      .from("tenant_modules")
      .update({ enabled: false })
      .eq("tenant_id", tenantId)
      .eq("module_key", "constituent_accounts");

    const { error } = await client.rpc("submit_claim_from_registration", {
      p_registration_id: registrationId,
    });

    await service
      .from("tenant_modules")
      .update({ enabled: true })
      .eq("tenant_id", tenantId)
      .eq("module_key", "constituent_accounts");

    // Silent, like every other branch: a tenant's entitlements are not a
    // claimant's business either. This is also the demo tenant's answer,
    // permanently (#1177).
    expect(error).toBeNull();
    expect(await claimsFor(userId)).toHaveLength(0);
  });

  test("a session is required, and anon does not have one", async () => {
    const registrationId = await registration({
      name: "Anonymous Attempt",
      email: uniqueEmail(`anon-${run}`),
    });

    const { error } = await anonClient().rpc("submit_claim_from_registration", {
      p_registration_id: registrationId,
    });

    // Not granted to anon at all, so this is a permission error rather than a
    // silent no-op -- and nothing about the directory is in it.
    expect(error).not.toBeNull();
    const { count } = await service
      .from("person_claims")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("stated_name", "Anonymous Attempt");
    expect(count).toBe(0);
  });

  test("says out loud when a caller is going too fast, and only that", async () => {
    const email = uniqueEmail(`fast-${run}`);
    const { client } = await makeConstituent(email);
    const registrationId = await registration({ name: "In A Hurry", email });
    const ip = uniqueIp();

    const results = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      results.push(
        await client.rpc("submit_claim_from_registration", {
          p_registration_id: registrationId,
          p_ip_address: ip,
        }),
      );
    }

    expect(results.slice(0, 5).every((r) => r.error === null)).toBe(true);
    expect(results[5].error?.message).toContain("RATE_LIMITED");
  });
});
