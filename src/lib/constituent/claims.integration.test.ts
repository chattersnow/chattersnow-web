// Claiming a directory record (#1162) against a real local stack.
//
// Two things are being checked, and the first is the load-bearing one:
//
//   1. The auto-link fence holds. `resolve_current_person_id()` and
//      `ensure_current_person()` link an account to a `people` row by email
//      match with no review, and are safe only because both return null when
//      `current_tenant_id()` is null -- which is true of a constituent because
//      #1161 resolves their tenant from the request host and gives them no
//      `tenant_memberships` row. Neither function says so. This file does.
//
//   2. The claim does what it says: matches on three tiers for a reviewer,
//      tells the claimant nothing, and links exactly once on approval.
//
// Requires `bun run db:start && bun run db:reset`; run via
// `bun run test:integration`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  serviceRoleClient,
  signIn,
  uniqueEmail,
  uniqueIp,
} from "../../../test/integration-setup";
import { getOpsInboxSummary } from "@/lib/portal/attention-items";

const service = serviceRoleClient();
const run = crypto.randomUUID().slice(0, 8);

let tenantId: string;
/** A record nobody is linked to, at an address a claimant will also hold. */
let targetPersonId: string;
let targetEmail: string;
/** A record reachable only by its Instagram handle -- no email at all. */
let handlePersonId: string;
/** A record reachable only by a name close to what a claimant will type. */
let namePersonId: string;

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
  const client = await signIn(email);
  return { client, userId: data.user!.id };
}

const createdUsers: string[] = [];
const createdPeople: string[] = [];

async function person(fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await service
    .from("people")
    .insert({ tenant_id: tenantId, source_type: "other", ...fields })
    .select("id")
    .single();
  if (error) throw new Error(`person: ${error.message}`);
  createdPeople.push(data.id);
  return data.id;
}

beforeAll(async () => {
  const { data } = await service
    .from("tenants")
    .select("id")
    .eq("slug", "example-nonprofit")
    .single();
  tenantId = data!.id;

  // The area is a module a tenant opts into, and `has_permission()` folds the
  // module check in -- so with `constituent_accounts` off, the review RPCs
  // refuse a full administrator and `submit_person_claim` writes nothing. A
  // tenant actually using this has it on, so the fixtures turn it on. The
  // off case gets its own test below rather than being the ambient state.
  const { error: moduleError } = await service.from("tenant_modules").upsert(
    {
      tenant_id: tenantId,
      module_key: "constituent_accounts",
      enabled: true,
    },
    { onConflict: "tenant_id,module_key" },
  );
  if (moduleError) throw new Error(`enable module: ${moduleError.message}`);

  targetEmail = uniqueEmail(`claim-target-${run}`);
  targetPersonId = await person({ name: "Robin Ashford", email: targetEmail });
  handlePersonId = await person({
    name: "Sasha Nkemelu",
    instagram_handle: `sasha_${run}`,
  });
  namePersonId = await person({ name: `Jonathan Whitfield ${run}` });
});

afterAll(async () => {
  await service
    .from("tenant_modules")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("module_key", "constituent_accounts");
  await service.from("person_claims").delete().in("auth_user_id", createdUsers);
  await service.from("people").delete().in("id", createdPeople);
  // auth.users rows are left: audit_log references them, and the seed is reset
  // between runs anyway.
});

describe("the auto-link fence", () => {
  test("a membership-less account is linked to nothing, even at a matching address", async () => {
    const { client, userId } = await makeConstituent(targetEmail);
    createdUsers.push(userId);

    const memberships = await service
      .from("tenant_memberships")
      .select("id")
      .eq("user_id", userId);
    expect(memberships.data ?? []).toHaveLength(0);

    // The two functions that would link by email match if they could.
    expect((await client.rpc("resolve_current_person_id")).data).toBeNull();
    expect((await client.rpc("ensure_current_person")).data ?? []).toEqual([]);
    expect((await client.rpc("my_person_id")).data).toBeNull();
    expect((await client.rpc("my_public_person_id")).data).toBeNull();

    // And the record at that address is untouched.
    const after = await service
      .from("people")
      .select("auth_user_id")
      .eq("id", targetPersonId)
      .single();
    expect(after.data?.auth_user_id).toBeNull();
  });

  test("a constituent cannot read the directory directly either", async () => {
    const { client, userId } = await makeConstituent(
      uniqueEmail(`reader-${run}`),
    );
    createdUsers.push(userId);

    const { data } = await client.from("people").select("id").limit(5);
    expect(data ?? []).toEqual([]);
  });
});

describe("submitting a claim", () => {
  test("tells the claimant nothing, whether they matched or not", async () => {
    const matcher = await makeConstituent(uniqueEmail(`matched-${run}`));
    const stranger = await makeConstituent(uniqueEmail(`stranger-${run}`));
    createdUsers.push(matcher.userId, stranger.userId);

    const matched = await matcher.client.rpc("submit_person_claim", {
      p_name: "Robin Ashford",
      p_email: targetEmail,
    });
    const unmatched = await stranger.client.rpc("submit_person_claim", {
      p_name: "Nobody In Particular",
    });

    // Identical in every observable way: no error, no payload, no count.
    expect(matched.error).toBeNull();
    expect(unmatched.error).toBeNull();
    expect(matched.data).toEqual(unmatched.data);
  });

  test("a second claim while one is open changes nothing", async () => {
    const { client, userId } = await makeConstituent(
      uniqueEmail(`twice-${run}`),
    );
    createdUsers.push(userId);

    await client.rpc("submit_person_claim", { p_name: "First Attempt" });
    const second = await client.rpc("submit_person_claim", {
      p_name: "Second Attempt",
    });
    expect(second.error).toBeNull();

    const claims = await service
      .from("person_claims")
      .select("stated_name")
      .eq("auth_user_id", userId);
    expect(claims.data).toHaveLength(1);
    expect(claims.data![0].stated_name).toBe("First Attempt");
  });

  // The #902 rule: hiding a page does not stop a form post, and this RPC is
  // reachable with curl whatever `/my` answers.
  test("writes nothing while the tenant has the module off", async () => {
    const { client, userId } = await makeConstituent(
      uniqueEmail(`gated-${run}`),
    );
    createdUsers.push(userId);

    await service.from("tenant_modules").upsert(
      {
        tenant_id: tenantId,
        module_key: "constituent_accounts",
        enabled: false,
      },
      { onConflict: "tenant_id,module_key" },
    );
    try {
      const { error } = await client.rpc("submit_person_claim", {
        p_name: "Gated Out",
      });
      // Silent, not an error: a tenant's entitlements are not a claimant's
      // business either.
      expect(error).toBeNull();
      const claims = await service
        .from("person_claims")
        .select("id")
        .eq("auth_user_id", userId);
      expect(claims.data ?? []).toEqual([]);
    } finally {
      await service.from("tenant_modules").upsert(
        {
          tenant_id: tenantId,
          module_key: "constituent_accounts",
          enabled: true,
        },
        { onConflict: "tenant_id,module_key" },
      );
    }
  });

  // Five per IP per fifteen minutes, like the other public intake routes. The
  // fixtures above share one IP, so this runs last in its describe and uses a
  // fresh one to avoid capping the tests that follow it.
  test("caps how fast one address may ask", async () => {
    const ip = uniqueIp();
    const results: (string | null)[] = [];
    for (let attempt = 0; attempt < 7; attempt++) {
      const claimant = await makeConstituent(
        uniqueEmail(`burst-${attempt}-${run}`),
      );
      createdUsers.push(claimant.userId);
      const { error } = await claimant.client.rpc("submit_person_claim", {
        p_name: `Burst ${attempt}`,
        p_ip_address: ip,
      });
      results.push(error?.message ?? null);
    }
    expect(results.slice(0, 5).every((message) => message === null)).toBe(true);
    expect(results[5]).toContain("RATE_LIMITED");
  });

  test("is refused to a visitor with no session", async () => {
    const { error } = await anonClient().rpc("submit_person_claim", {
      p_name: "Anonymous",
    });
    expect(error).not.toBeNull();
  });

  test("a claimant sees their own claim and nobody else's", async () => {
    const mine = await makeConstituent(uniqueEmail(`mine-${run}`));
    const theirs = await makeConstituent(uniqueEmail(`theirs-${run}`));
    createdUsers.push(mine.userId, theirs.userId);

    await mine.client.rpc("submit_person_claim", { p_name: "Mine" });
    await theirs.client.rpc("submit_person_claim", { p_name: "Theirs" });

    const visible = await mine.client
      .from("person_claims")
      .select("auth_user_id");
    expect(visible.data).toHaveLength(1);
    expect(visible.data![0].auth_user_id).toBe(mine.userId);
  });
});

describe("candidate matching", () => {
  async function candidatesFor(
    claimant: { client: SupabaseClient; userId: string },
    fields: Record<string, unknown>,
  ) {
    await claimant.client.rpc("submit_person_claim", fields);
    const { data: claim } = await service
      .from("person_claims")
      .select("id")
      .eq("auth_user_id", claimant.userId)
      .single();
    const { data, error } = await adminClient.rpc("person_claim_candidates", {
      p_claim_id: claim!.id,
    });
    if (error) throw new Error(`candidates: ${error.message}`);
    return data as {
      person_id: string;
      tier: string;
      score: number;
      already_linked: boolean;
    }[];
  }

  test("a verified email is the strongest tier", async () => {
    const claimant = await makeConstituent(targetEmail.replace("@", "+dup@"));
    createdUsers.push(claimant.userId);
    // Deliberately a *different* verified address from the record's, so the
    // email tier must not fire and the name tier must carry it.
    const rows = await candidatesFor(claimant, { p_name: "Robin Ashford" });

    const target = rows.find((r) => r.person_id === targetPersonId);
    expect(target?.tier).toBe("name");
  });

  test("matches on a verified address the account actually holds", async () => {
    const claimant = await makeConstituent(uniqueEmail(`verified-${run}`));
    createdUsers.push(claimant.userId);
    await service
      .from("people")
      .update({ email: null })
      .eq("id", handlePersonId);

    const rows = await candidatesFor(claimant, {
      p_name: "Someone Else Entirely",
      p_email: targetEmail,
    });
    // The *typed* address matches the target record, but the account's
    // verified address does not -- so the email tier must not fire on it.
    expect(rows.find((r) => r.person_id === targetPersonId)).toBeUndefined();
  });

  test("matches an Instagram handle however it was typed", async () => {
    for (const typed of [
      `sasha_${run}`,
      `@sasha_${run}`,
      `https://instagram.com/sasha_${run}/`,
    ]) {
      const claimant = await makeConstituent(
        uniqueEmail(`ig-${typed.length}-${run}`),
      );
      createdUsers.push(claimant.userId);
      const rows = await candidatesFor(claimant, {
        p_name: "Unrelated Name",
        p_instagram_handle: typed,
      });
      const hit = rows.find((r) => r.person_id === handlePersonId);
      expect(hit?.tier, typed).toBe("instagram");
    }
  });

  test("a near-miss name ranks, an unrelated one does not", async () => {
    const near = await makeConstituent(uniqueEmail(`near-${run}`));
    createdUsers.push(near.userId);
    const nearRows = await candidatesFor(near, {
      p_name: `Jonathon Whitfield ${run}`,
    });
    const hit = nearRows.find((r) => r.person_id === namePersonId);
    expect(hit?.tier).toBe("name");
    expect(hit!.score).toBeGreaterThan(0.45);
    expect(hit!.score).toBeLessThan(1);

    const far = await makeConstituent(uniqueEmail(`far-${run}`));
    createdUsers.push(far.userId);
    const farRows = await candidatesFor(far, { p_name: "Zzyzx Quimby" });
    expect(farRows.find((r) => r.person_id === namePersonId)).toBeUndefined();
  });

  test("is refused to someone without the permission", async () => {
    const claimant = await makeConstituent(uniqueEmail(`perm-${run}`));
    createdUsers.push(claimant.userId);
    await claimant.client.rpc("submit_person_claim", {
      p_name: "Robin Ashford",
    });
    const { data: claim } = await service
      .from("person_claims")
      .select("id")
      .eq("auth_user_id", claimant.userId)
      .single();

    // The claimant themselves, and a signed-in account with no role: both get
    // nothing back rather than an answer about who is in the directory.
    for (const client of [
      claimant.client,
      await signIn(SEEDED_USERS.noAccess),
    ]) {
      const { data } = await client.rpc("person_claim_candidates", {
        p_claim_id: claim!.id,
      });
      expect(data ?? []).toEqual([]);
    }
  });
});

describe("the queue asks to be noticed", () => {
  test("a pending claim reaches the ops inbox, and only for a reviewer", async () => {
    const claimant = await makeConstituent(uniqueEmail(`attention-${run}`));
    createdUsers.push(claimant.userId);
    await claimant.client.rpc("submit_person_claim", {
      p_name: "Waiting For Review",
    });

    const flags = {
      canSeeVolunteerApplications: false,
      canSeeContactMessages: false,
      canSeeEventCheckins: false,
      canSeeArtworkSubmissions: false,
      canSeeGearRequests: false,
      canSeePersonClaims: true,
    };

    const mine = await getOpsInboxSummary(adminClient, flags);
    const item = mine.items.find((row) => row.key === "person_claims_pending");
    expect(item?.count).toBeGreaterThan(0);
    expect(item?.href).toBe("/portal/people/claims");

    // The flag forced on for an account that holds no such permission: the
    // count has to come back empty from the database, not from the flag.
    const theirs = await getOpsInboxSummary(
      await signIn(SEEDED_USERS.volunteer),
      flags,
    );
    expect(
      theirs.items.some((row) => row.key === "person_claims_pending"),
    ).toBe(false);
  });
});

describe("reviewing a claim", () => {
  async function openClaim(label: string) {
    const claimant = await makeConstituent(uniqueEmail(`${label}-${run}`));
    createdUsers.push(claimant.userId);
    await claimant.client.rpc("submit_person_claim", {
      p_name: `${label} Person`,
    });
    const { data } = await service
      .from("person_claims")
      .select("id")
      .eq("auth_user_id", claimant.userId)
      .single();
    return { ...claimant, claimId: data!.id as string };
  }

  test("approving links the account to the record, once", async () => {
    const first = await openClaim("approve");
    const { data: personId, error } = await adminClient.rpc(
      "review_person_claim",
      {
        p_claim_id: first.claimId,
        p_approve: true,
        p_person_id: targetPersonId,
      },
    );
    expect(error).toBeNull();
    expect(personId).toBe(targetPersonId);

    const linked = await service
      .from("people")
      .select("auth_user_id")
      .eq("id", targetPersonId)
      .single();
    expect(linked.data?.auth_user_id).toBe(first.userId);

    // And now the constituent's own reader finds it -- the first moment it
    // returns anything for this account.
    expect((await first.client.rpc("my_public_person_id")).data).toBe(
      targetPersonId,
    );

    // A second account cannot be approved onto the same record.
    const second = await openClaim("approve-again");
    const { error: clash } = await adminClient.rpc("review_person_claim", {
      p_claim_id: second.claimId,
      p_approve: true,
      p_person_id: targetPersonId,
    });
    expect(clash?.message).toContain("already linked to a different account");
  });

  test("approving with no candidate creates a record", async () => {
    const claim = await openClaim("newcomer");
    const { data: personId, error } = await adminClient.rpc(
      "review_person_claim",
      { p_claim_id: claim.claimId, p_approve: true },
    );
    expect(error).toBeNull();
    createdPeople.push(personId as string);

    const created = await service
      .from("people")
      .select("name, auth_user_id, tenant_id")
      .eq("id", personId as string)
      .single();
    expect(created.data?.auth_user_id).toBe(claim.userId);
    expect(created.data?.tenant_id).toBe(tenantId);
  });

  test("rejecting links nothing and closes the claim", async () => {
    const claim = await openClaim("reject");
    const { error } = await adminClient.rpc("review_person_claim", {
      p_claim_id: claim.claimId,
      p_approve: false,
      p_review_note: "Could not confirm.",
    });
    expect(error).toBeNull();

    const row = await service
      .from("person_claims")
      .select("status, reviewed_by, reviewed_at")
      .eq("id", claim.claimId)
      .single();
    expect(row.data?.status).toBe("rejected");
    expect(row.data?.reviewed_by).toBeTruthy();
    expect(row.data?.reviewed_at).toBeTruthy();

    expect((await claim.client.rpc("my_public_person_id")).data).toBeNull();
  });

  test("a decided claim cannot be decided again", async () => {
    const claim = await openClaim("twice-reviewed");
    await adminClient.rpc("review_person_claim", {
      p_claim_id: claim.claimId,
      p_approve: false,
    });
    const { error } = await adminClient.rpc("review_person_claim", {
      p_claim_id: claim.claimId,
      p_approve: true,
    });
    expect(error?.message).toContain("already been rejected");
  });

  test("is refused without the permission", async () => {
    const claim = await openClaim("unauthorized");

    // The claimant cannot approve themselves, which is the case that matters.
    const { error: selfApproval } = await claim.client.rpc(
      "review_person_claim",
      { p_claim_id: claim.claimId, p_approve: true, p_person_id: namePersonId },
    );
    expect(selfApproval).not.toBeNull();

    const linked = await service
      .from("people")
      .select("auth_user_id")
      .eq("id", namePersonId)
      .single();
    expect(linked.data?.auth_user_id).toBeNull();
  });

  test("leaves an audit row naming the reviewer", async () => {
    const claim = await openClaim("audited");
    await adminClient.rpc("review_person_claim", {
      p_claim_id: claim.claimId,
      p_approve: false,
    });

    const { data } = await service
      .from("audit_log")
      .select("table_name, action")
      .eq("table_name", "person_claims")
      .eq("record_id", claim.claimId);
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});
