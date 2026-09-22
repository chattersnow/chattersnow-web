// Claiming a record from the public gear request that just created it
// (#1359), against a real local stack.
//
// The claim itself is #1162's and `claims.integration.test.ts` covers what it
// is made of; `claim-from-registration.integration.test.ts` covers the other
// source. What is particular here is where the evidence comes from:
// `gear_requests` stores no typed contact fields, so it is read off the
// `people` row the request attached to -- and every way that read can fail has
// to be the same silence.
//
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  anonClient,
  enableModule,
  seededTenantId,
  serviceRoleClient,
  signIn,
  uniqueEmail,
  uniqueIp,
  withModule,
} from "../../../test/integration-setup";

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);

let tenantId: string;
/** The tenant's own module row as this file found it. */
let restoreModule: () => Promise<void>;

const createdUsers: string[] = [];
const createdPeople: string[] = [];
const createdRequests: string[] = [];

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
 * A gear request exactly as `request_gear_items()` leaves one: a `people` row
 * matched or minted from the typed address, and a header pointing at it.
 *
 * Built directly rather than through the RPC because none of what follows is
 * about reserving items -- only about which person the header names.
 */
async function gearRequest(fields: {
  name: string;
  email?: string | null;
  phone?: string | null;
  instagramHandle?: string | null;
  createdAt?: string;
  personId?: string | null;
}): Promise<string> {
  let personId = fields.personId;
  if (personId === undefined) {
    const { data: personRow, error: personError } = await service
      .from("people")
      .insert({
        tenant_id: tenantId,
        source_type: "other",
        name: fields.name,
        email: fields.email ?? null,
        phone: fields.phone ?? null,
        instagram_handle: fields.instagramHandle ?? null,
      })
      .select("id")
      .single();
    if (personError) throw new Error(`person: ${personError.message}`);
    personId = personRow.id as string;
    createdPeople.push(personId);
  }

  const { data, error } = await service
    .from("gear_requests")
    .insert({
      tenant_id: tenantId,
      person_id: personId,
      delivery_method: "meetup",
      ...(fields.createdAt ? { created_at: fields.createdAt } : {}),
    })
    .select("id")
    .single();
  if (error) throw new Error(`gear request: ${error.message}`);
  createdRequests.push(data.id as string);
  return data.id as string;
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
  tenantId = await seededTenantId();
  restoreModule = await enableModule(tenantId, "constituent_accounts");
});

afterAll(async () => {
  await service.from("person_claims").delete().in("auth_user_id", createdUsers);
  await service.from("gear_requests").delete().in("id", createdRequests);
  await service.from("people").delete().in("id", createdPeople);
  await restoreModule();
});

describe("claiming from a gear request", () => {
  test("takes the evidence off the record the request attached to", async () => {
    const email = uniqueEmail(`gear-typed-${run}`);
    const { client, userId } = await makeConstituent(email);
    const requestId = await gearRequest({
      name: "Robin Ashford",
      email,
      phone: "555-0148",
      instagramHandle: "Robin.Ashford",
    });

    const { error } = await client.rpc("submit_claim_from_gear_request", {
      p_request_id: requestId,
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
    expect(claims[0].note).toContain("gear library");
    expect(claims[0].status).toBe("pending");
    // The request knows which record it attached to; the claim does not name
    // it, because nobody picked it. That is the reviewer's decision.
    expect(claims[0].claimed_person_id).toBeNull();
  });

  test("prefers the record's preferred name, as every other surface does", async () => {
    const email = uniqueEmail(`gear-preferred-${run}`);
    const { client, userId } = await makeConstituent(email);
    const { data: personRow } = await service
      .from("people")
      .insert({
        tenant_id: tenantId,
        source_type: "other",
        name: "Roberta Ashford",
        preferred_name: "Robin",
        email,
      })
      .select("id")
      .single();
    createdPeople.push(personRow!.id);
    const requestId = await gearRequest({
      name: "unused",
      personId: personRow!.id,
    });

    await client.rpc("submit_claim_from_gear_request", {
      p_request_id: requestId,
    });

    expect((await claimsFor(userId))[0].stated_name).toBe("Robin");
  });

  test("puts the request's own record first on the reviewer's queue", async () => {
    const email = uniqueEmail(`gear-ranked-${run}`);
    const { client, userId } = await makeConstituent(email);
    const requestId = await gearRequest({ name: `Ranked ${run}`, email });

    await client.rpc("submit_claim_from_gear_request", {
      p_request_id: requestId,
    });
    const claims = await claimsFor(userId);

    const { data, error } = await adminClient.rpc("person_claim_candidates", {
      p_claim_id: claims[0].id,
    });
    if (error) throw new Error(`candidates: ${error.message}`);
    const rows = data as { person_id: string; tier: string }[];

    // The account's verified address is the one the request was matched on, so
    // the record it attached to is the tier-1 candidate with no change to
    // person_claim_candidates() at all.
    expect(rows[0].tier).toBe("email");
    expect(createdPeople).toContain(rows[0].person_id);
  });

  test("an unknown id, one from last month, and an anonymized one are all silence", async () => {
    const { client, userId } = await makeConstituent(
      uniqueEmail(`gear-old-${run}`),
    );
    const stale = await gearRequest({
      name: "Stale Requester",
      email: uniqueEmail(`gear-stale-${run}`),
      createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    });
    // What the retention purge leaves behind: the requester link is gone, so
    // there is no record to read the evidence off.
    const purged = await gearRequest({ name: "Purged", personId: null });

    const missing = await client.rpc("submit_claim_from_gear_request", {
      p_request_id: crypto.randomUUID(),
    });
    const expired = await client.rpc("submit_claim_from_gear_request", {
      p_request_id: stale,
    });
    const anonymized = await client.rpc("submit_claim_from_gear_request", {
      p_request_id: purged,
    });

    // Identical in every observable way, and none of them wrote anything: an
    // id that names nothing must not be distinguishable from one that does.
    expect(missing.error).toBeNull();
    expect(expired.error).toBeNull();
    expect(anonymized.error).toBeNull();
    expect(missing.data).toEqual(expired.data);
    expect(missing.data).toEqual(anonymized.data);
    expect(await claimsFor(userId)).toHaveLength(0);
  });

  test("a second request while a claim is open leaves the first alone", async () => {
    const email = uniqueEmail(`gear-twice-${run}`);
    const { client, userId } = await makeConstituent(email);
    const first = await gearRequest({ name: "First Time", email });
    const second = await gearRequest({
      name: "Second Time",
      email: uniqueEmail(`gear-twice-b-${run}`),
    });

    await client.rpc("submit_claim_from_gear_request", {
      p_request_id: first,
    });
    const { error } = await client.rpc("submit_claim_from_gear_request", {
      p_request_id: second,
    });
    expect(error).toBeNull();

    const claims = await claimsFor(userId);
    expect(claims).toHaveLength(1);
    expect(claims[0].stated_name).toBe("First Time");
  });

  test("an account already linked to a record has nothing to claim", async () => {
    const email = uniqueEmail(`gear-linked-${run}`);
    const { client, userId } = await makeConstituent(email);
    const requestId = await gearRequest({ name: "Already Linked", email });

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

    const { error } = await client.rpc("submit_claim_from_gear_request", {
      p_request_id: requestId,
    });
    expect(error).toBeNull();
    expect(await claimsFor(userId)).toHaveLength(0);
  });

  test("writes nothing on a tenant without the constituent area", async () => {
    const email = uniqueEmail(`gear-module-off-${run}`);
    const { client, userId } = await makeConstituent(email);
    const requestId = await gearRequest({ name: "Module Off", email });

    let error: unknown = null;
    await withModule(tenantId, "constituent_accounts", false, async () => {
      ({ error } = await client.rpc("submit_claim_from_gear_request", {
        p_request_id: requestId,
      }));
    });

    // Silent, like every other branch: a tenant's entitlements are not a
    // claimant's business either. This is also the demo tenant's answer,
    // permanently (#1177).
    expect(error).toBeNull();
    expect(await claimsFor(userId)).toHaveLength(0);
  });

  test("a session is required, and anon does not have one", async () => {
    const requestId = await gearRequest({
      name: "Anonymous Attempt",
      email: uniqueEmail(`gear-anon-${run}`),
    });

    const { error } = await anonClient().rpc("submit_claim_from_gear_request", {
      p_request_id: requestId,
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
    const email = uniqueEmail(`gear-fast-${run}`);
    const { client } = await makeConstituent(email);
    const requestId = await gearRequest({ name: "In A Hurry", email });
    const ip = uniqueIp();

    const results = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      results.push(
        await client.rpc("submit_claim_from_gear_request", {
          p_request_id: requestId,
          p_ip_address: ip,
        }),
      );
    }

    expect(results.slice(0, 5).every((r) => r.error === null)).toBe(true);
    expect(results[5].error?.message).toContain("RATE_LIMITED");
  });
});
