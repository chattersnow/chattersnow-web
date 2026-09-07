/**
 * #602. The retention purge, against a real database.
 *
 * These have to be integration tests rather than unit tests: the rules are
 * SQL, two of the clocks read `updated_at` columns maintained by
 * `set_updated_at` triggers (so no client can backdate them -- which is why
 * `run_retention_purge` takes `p_as_of` at all), and the whole point of the
 * eligibility rule is a `pg_constraint` walk that has no meaning outside
 * Postgres.
 *
 * Every clock gets a just-inside / just-outside pair. A retention job that
 * deletes a day early is a privacy feature that destroys records it was
 * supposed to keep, and a single "it deleted something" assertion would not
 * notice.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { RETENTION_POLICIES } from "@/lib/retention";
import {
  SEEDED_USERS,
  adminClient,
  cleanupDonation,
  createAvailableGearItems,
  createPerson,
  createPublishedEvent,
  signInAs,
  uniqueEmail,
} from "@/../test/integration-setup";

/**
 * run_retention_purge is deliberately ungranted -- pg_cron runs it as the owner
 * and no client should be able to reach it, least of all with a p_as_of of its
 * own choosing. So the tests call it the way the scheduler does, through a
 * privileged connection, rather than the plan being weakened to make it
 * testable. Everything else here goes through the granted RPCs as a real admin
 * session, which is what the portal does.
 */
const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

const cleanups: Array<() => Promise<void>> = [];

/**
 * The tenant every seeded fixture belongs to.
 *
 * Since Phase 5b (#707, 20260906160000) the rules, the runs and the run log are
 * per tenant, and `run_retention_purge` sweeps every active tenant when it is
 * given none -- returning null, because a sweep has no single run to name.
 * These tests are about one tenant's rules, and they need the run id back, so
 * they always name it. Resolved once and cached: on a single-tenant local stack
 * this is the seeded tenant, and the isolation of two tenants is asserted in
 * `tenant-isolation.integration.test.ts` rather than here.
 */
let seededTenantId: string | null = null;
async function tenantId(): Promise<string> {
  if (seededTenantId) return seededTenantId;
  const { data, error } = await serviceClient
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (error) throw error;
  seededTenantId = data.id as string;
  return seededTenantId;
}

async function runPurge(options: {
  dryRun: boolean;
  asOf: string;
}): Promise<string> {
  const { data, error } = await serviceClient.rpc("run_retention_purge", {
    p_dry_run: options.dryRun,
    p_as_of: options.asOf,
    p_trigger: "manual",
    p_tenant_id: await tenantId(),
  });
  if (error) throw error;
  return data as string;
}

/** `now() + offset`, as an ISO timestamp the RPC can take for `p_as_of`. */
function clockAt(offsetMs: number) {
  return new Date(Date.now() + offsetMs).toISOString();
}

const DAY = 24 * 60 * 60 * 1000;
const YEAR = 365 * DAY;

/**
 * `now() + n calendar years + offsetDays`, for the clocks long enough that leap
 * days matter.
 *
 * The rules read `p_as_of - interval '7 years'`, which Postgres counts in
 * calendar years, while `7 * YEAR` is 2555 days -- two days short by 2033, and
 * two leap days is enough to put a just-outside fixture back inside the window.
 * The three-year clocks above absorb their single leap day inside the ±1 day
 * margin; seven years does not.
 */
function clockAtYears(years: number, offsetDays: number) {
  const asOf = new Date();
  asOf.setUTCFullYear(asOf.getUTCFullYear() + years);
  return new Date(asOf.getTime() + offsetDays * DAY).toISOString();
}

// Through the granted RPC, not a table update: retention_policies has no write
// policy and no update grant, which is itself part of the design.
async function setMode(policyKey: string, mode: string) {
  const { error } = await adminClient.rpc("set_retention_policy_mode", {
    p_policy_key: policyKey,
    p_mode: mode,
  });
  if (error) throw error;
}

async function countsFor(runId: string, policyKey: string) {
  const { data, error } = await adminClient
    .from("retention_run_tables")
    .select("policy_key, table_name, action, row_count")
    .eq("run_id", runId)
    .eq("policy_key", policyKey);
  if (error) throw error;
  return data ?? [];
}

describe("run_retention_purge", () => {
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup();
    // Leave every policy as it ships. A test run that left a rule enforcing
    // would arm the nightly job on whatever database this ran against.
    const { data: policies } = await serviceClient
      .from("retention_policies")
      .select("policy_key")
      .eq("tenant_id", await tenantId());
    for (const policy of policies ?? []) {
      await setMode(policy.policy_key, "dry_run");
    }
  });

  // The reason src/lib/retention.ts duplicates `period` at all.
  //
  // /privacy renders its prose from that module and the purge reads its clocks
  // from this table, so nothing structural stops someone changing a period in a
  // migration and leaving the published page promising the old one -- which is
  // the exact failure #602 exists to fix, reintroduced one layer down. Postgres
  // normalises an interval on the way in ("3 mons" for "3 months"), so compare
  // through interval arithmetic rather than string equality.
  describe("the published periods and the enforced periods agree", () => {
    test("every published policy has a matching row with the same clock", async () => {
      const { data, error } = await serviceClient
        .from("retention_policies")
        .select("policy_key, period, secondary_period")
        // One row per policy per tenant since Phase 5b, and the Map below keys
        // on policy_key alone -- unscoped, another tenant's clock would decide
        // whether /privacy is telling the truth about ours.
        .eq("tenant_id", await tenantId());
      if (error) throw error;

      const rows = new Map(data!.map((row) => [row.policy_key, row]));

      for (const policy of RETENTION_POLICIES) {
        const row = rows.get(policy.key);
        expect(
          row,
          `no retention_policies row for ${policy.key}`,
        ).toBeDefined();

        // As an admin, not as service_role: since Phase 5b the comparison
        // answers for the caller's tenant, and a session-less connection has
        // none. This is also how the portal calls it.
        const { data: agrees, error: compareError } = await adminClient.rpc(
          "retention_period_matches",
          {
            p_policy_key: policy.key,
            p_period: policy.period,
            p_secondary_period: policy.secondaryPeriod ?? null,
          },
        );
        if (compareError) throw compareError;
        expect(
          agrees,
          `${policy.key}: /privacy says "${policy.period}" but retention_policies says "${row!.period}"`,
        ).toBe(true);
      }
    });
  });

  describe("contact messages, 2 years from submission", () => {
    let recentId: string;
    let oldId: string;

    beforeAll(async () => {
      const rows = [
        {
          name: "Recent",
          email: uniqueEmail("retention-recent"),
          topic: "general",
          message: "recent",
        },
        {
          name: "Old",
          email: uniqueEmail("retention-old"),
          topic: "general",
          message: "old",
        },
      ];
      const { data, error } = await serviceClient
        .from("contact_messages")
        .insert(rows)
        .select("id");
      if (error) throw error;
      recentId = data![0].id;
      oldId = data![1].id;
      cleanups.push(async () => {
        await serviceClient
          .from("contact_messages")
          .delete()
          .in("id", [recentId, oldId]);
      });
    });

    test("a message one day inside the window survives", async () => {
      await setMode("contact_messages", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(2 * YEAR - DAY) });

      const { data } = await serviceClient
        .from("contact_messages")
        .select("id")
        .eq("id", recentId)
        .maybeSingle();
      expect(data).not.toBeNull();
    });

    test("a message one day past the window is deleted", async () => {
      await setMode("contact_messages", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(2 * YEAR + DAY) });

      const { data } = await serviceClient
        .from("contact_messages")
        .select("id")
        .eq("id", oldId)
        .maybeSingle();
      expect(data).toBeNull();
    });
  });

  describe("the two safety gates", () => {
    let messageId: string;

    beforeAll(async () => {
      const { data, error } = await serviceClient
        .from("contact_messages")
        .insert({
          name: "Gate",
          email: uniqueEmail("retention-gate"),
          topic: "general",
          message: "gate",
        })
        .select("id")
        .single();
      if (error) throw error;
      messageId = data.id;
      cleanups.push(async () => {
        await serviceClient
          .from("contact_messages")
          .delete()
          .eq("id", messageId);
      });
    });

    // The property the whole rollout rests on. The nightly cron job passes
    // p_dry_run => false, so if mode alone did not hold the line, this feature
    // would start deleting from production the night it merged.
    test("a policy in dry_run acts on nothing even when p_dry_run is false", async () => {
      await setMode("contact_messages", "dry_run");
      const runId = await runPurge({
        dryRun: false,
        asOf: clockAt(5 * YEAR),
      });

      const { data } = await serviceClient
        .from("contact_messages")
        .select("id")
        .eq("id", messageId)
        .maybeSingle();
      expect(data).not.toBeNull();

      // It still reports what it would have removed -- that is the point of a
      // preview, and an empty log would make the mode indistinguishable from
      // 'off'.
      const counts = await countsFor(runId, "contact_messages");
      expect(counts[0]?.row_count).toBeGreaterThan(0);
    });

    test("p_dry_run true acts on nothing even when the policy is enforcing", async () => {
      await setMode("contact_messages", "enforce");
      await runPurge({ dryRun: true, asOf: clockAt(5 * YEAR) });

      const { data } = await serviceClient
        .from("contact_messages")
        .select("id")
        .eq("id", messageId)
        .maybeSingle();
      expect(data).not.toBeNull();
    });

    test("a policy set to off records nothing to act on", async () => {
      await setMode("contact_messages", "off");
      const runId = await runPurge({ dryRun: false, asOf: clockAt(5 * YEAR) });

      const counts = await countsFor(runId, "contact_messages");
      expect(counts[0]?.action).toBe("skipped");
      expect(counts[0]?.row_count).toBe(0);
    });
  });

  describe("who is exempt", () => {
    let donorId: string;
    let plainId: string;

    beforeAll(async () => {
      const donor = await createPerson({
        email: uniqueEmail("retention-donor"),
      });
      const plain = await createPerson({
        email: uniqueEmail("retention-plain"),
      });
      donorId = donor.id;
      plainId = plain.id;
      cleanups.push(donor.cleanup, plain.cleanup);

      for (const id of [donorId, plainId]) {
        const { error } = await adminClient
          .from("people")
          .update({
            riding_discipline: "ski",
            ski_experience_level: "beginner",
          })
          .eq("id", id);
        if (error) throw error;
      }

      const { data, error } = await adminClient
        .from("donations")
        .insert({ donor_id: donorId, donated_at: new Date().toISOString() })
        .select("id")
        .single();
      if (error) throw error;
      const donationId = data.id as string;
      cleanups.push(async () => {
        await adminClient.from("donations").delete().eq("id", donationId);
      });
    });

    // The single most important assertion in this file. Donation and financial
    // records are exempt from the published periods, and the mechanism is that
    // a foreign key outside retention_purgeable_person_refs still points at the
    // person. If this ever fails, the job is anonymizing donors.
    test("a donor keeps their identity", async () => {
      await setMode("rider_profiles", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(2 * YEAR + DAY) });

      const { data } = await adminClient
        .from("people")
        .select("name, email, is_anonymous")
        .eq("id", donorId)
        .single();
      expect(data!.is_anonymous).toBe(false);
      expect(data!.name).not.toBeNull();
    });

    // ...but the rider profile is on its own clock, and a donation does not
    // extend it. The two ideas are deliberately separate in the SQL.
    test("a donor's rider profile still expires", async () => {
      await setMode("rider_profiles", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(2 * YEAR + DAY) });

      const { data } = await adminClient
        .from("people")
        .select("riding_discipline, ski_experience_level")
        .eq("id", donorId)
        .single();
      expect(data!.riding_discipline).toBeNull();
      // Cleared as a group, or people_ski_level_requires_ski would have fired.
      expect(data!.ski_experience_level).toBeNull();
    });

    test("a person nothing else references is anonymized", async () => {
      await setMode("rider_profiles", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(2 * YEAR + DAY) });

      const { data } = await adminClient
        .from("people")
        .select("name, email, is_anonymous")
        .eq("id", plainId)
        .single();
      expect(data!.is_anonymous).toBe(true);
      expect(data!.name).toBeNull();
      expect(data!.email).toBeNull();
    });
  });

  describe("event registrations keep their counts", () => {
    let oldRegistrationId: string;
    let recentRegistrationId: string;

    // Two events and two registrations rather than one of each: the
    // just-inside and just-outside cases assert on the same columns, so
    // sharing a row would make the second test pass or fail depending on
    // whether the first one had already anonymized it.
    beforeAll(async () => {
      async function eventEndingAt(endedAt: number) {
        const event = await createPublishedEvent({
          startsAt: new Date(endedAt).toISOString(),
          endsAt: new Date(endedAt).toISOString(),
        });
        const { data, error } = await adminClient
          .from("event_registrations")
          .insert({
            event_id: event.id,
            name: "Retention Registrant",
            email: uniqueEmail("retention-registrant"),
            phone: "555-0100",
            notes: "allergic to nothing",
            party_size: 3,
            checked_in_at: new Date(endedAt).toISOString(),
          })
          .select("id")
          .single();
        if (error) throw error;

        // Pushed after the event's own cleanup so it runs first: cleanups are
        // replayed in reverse, and guard_event_delete refuses an event that
        // still has registrations hanging off it.
        cleanups.push(event.cleanup);
        cleanups.push(async () => {
          await adminClient
            .from("event_registrations")
            .delete()
            .eq("id", data.id);
        });
        return data.id as string;
      }

      oldRegistrationId = await eventEndingAt(Date.now() - 7 * DAY);
      // Ten days out, so it stays inside the window at every clock these tests
      // use: p_as_of moves forward three years, which puts the cutoff a day
      // from now, and a registration for an event that has not happened yet is
      // the case that must never be touched.
      recentRegistrationId = await eventEndingAt(Date.now() + 10 * DAY);
    });

    // Deleting these rows would restate attendance and impact figures under
    // grant reports that have already been filed, so the rule anonymizes.
    test("the row survives with its counts and loses every identifying field", async () => {
      await setMode("event_registrations", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(3 * YEAR + DAY) });

      const { data } = await adminClient
        .from("event_registrations")
        .select(
          "name, email, phone, notes, instagram_handle, person_id, party_size, checked_in_at",
        )
        .eq("id", oldRegistrationId)
        .single();

      expect(data).not.toBeNull();
      expect(data!.name).toBe("Removed");
      expect(data!.email).toBe("");
      expect(data!.phone).toBeNull();
      expect(data!.notes).toBeNull();
      expect(data!.person_id).toBeNull();
      // The reporting half, untouched.
      expect(data!.party_size).toBe(3);
      expect(data!.checked_in_at).not.toBeNull();
    });

    test("a registration inside the window is untouched", async () => {
      await setMode("event_registrations", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(3 * YEAR + DAY) });

      const { data } = await adminClient
        .from("event_registrations")
        .select("name, phone")
        .eq("id", recentRegistrationId)
        .single();
      expect(data!.name).toBe("Retention Registrant");
      expect(data!.phone).toBe("555-0100");
    });
  });

  // #721 moved the requester's free text off people.notes and onto the
  // movement, precisely so this rule could reach it: on the person it was
  // shielded indefinitely by anyone the purge is required to keep.
  describe("gear requests lose the requester and their notes", () => {
    const REQUEST_NOTES = "Size 10 boots if you have them.";
    let oldMovementId: string;
    let recentMovementId: string;

    beforeAll(async () => {
      const gear = await createAvailableGearItems(2);
      const requester = await createPerson({
        name: "Retention Requester",
        email: uniqueEmail("retention-requester"),
      });

      async function reservationAt(occurredAt: number, itemId: string) {
        const { data, error } = await adminClient
          .from("inventory_movements")
          .insert({
            inventory_item_id: itemId,
            movement_type: "reserved",
            quantity: 1,
            reason: "Public gear library request",
            recipient_person_id: requester.id,
            notes: REQUEST_NOTES,
            occurred_at: new Date(occurredAt).toISOString(),
          })
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      }

      oldMovementId = await reservationAt(
        Date.now() - 7 * DAY,
        gear.itemIds[0],
      );
      recentMovementId = await reservationAt(
        Date.now() + 10 * DAY,
        gear.itemIds[1],
      );

      // Reverse order: the donation cleanup deletes the items these movements
      // point at, and the requester outlives neither.
      cleanups.push(gear.cleanup);
      cleanups.push(requester.cleanup);
      cleanups.push(async () => {
        await adminClient
          .from("inventory_movements")
          .delete()
          .in("id", [oldMovementId, recentMovementId]);
      });
    });

    test("the movement survives as inventory history with both fields cleared", async () => {
      await setMode("gear_requests", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(3 * YEAR + DAY) });

      const { data } = await adminClient
        .from("inventory_movements")
        .select("recipient_person_id, notes, quantity, reason")
        .eq("id", oldMovementId)
        .single();

      expect(data).not.toBeNull();
      expect(data!.recipient_person_id).toBeNull();
      expect(data!.notes).toBeNull();
      // The inventory half, untouched.
      expect(data!.quantity).toBe(1);
      expect(data!.reason).toBe("Public gear library request");
    });

    test("a request inside the window keeps its notes", async () => {
      await setMode("gear_requests", "enforce");
      await runPurge({ dryRun: false, asOf: clockAt(3 * YEAR + DAY) });

      const { data } = await adminClient
        .from("inventory_movements")
        .select("recipient_person_id, notes")
        .eq("id", recentMovementId)
        .single();

      expect(data!.recipient_person_id).not.toBeNull();
      expect(data!.notes).toBe(REQUEST_NOTES);
    });
  });

  // #720. The two append-only stores that hold copies of the same personal
  // data: audit_log's row snapshots, and person_merges' copies of a people row.
  // Both are redacted in place rather than deleted -- the entry, its table, its
  // record, its actor and its timestamp are kept permanently, and only the
  // registered personal values inside the snapshot are cleared.
  describe("audit trail snapshots lose their personal keys and nothing else", () => {
    let expiredGrantId: string;
    let recentGrantId: string;

    async function createGrant(email: string) {
      const { data: role, error: roleError } = await serviceClient
        .from("roles")
        .select("id")
        .eq("name", "volunteer")
        .single();
      if (roleError) throw roleError;

      // Through the service client rather than the invitation action: this test
      // is about what the audit trigger recorded, and minting a real invite link
      // creates an auth.users row as a side effect (#763).
      const { data, error } = await serviceClient
        .from("pending_role_grants")
        .insert({
          tenant_id: await tenantId(),
          email,
          name: "Retention Invitee",
          role_id: role.id,
          status: "pending",
          expires_at: new Date(Date.now() + 7 * DAY).toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;

      const id = data.id as string;
      // Deleting it is the point: rule G does exactly this, and the delete
      // trigger writes the invitation email it just removed into old_data.
      await serviceClient.from("pending_role_grants").delete().eq("id", id);
      return id;
    }

    async function snapshotFor(grantId: string) {
      const { data, error } = await serviceClient
        .from("audit_log")
        .select(
          "table_name, record_id, action, occurred_at, old_data, redacted_at",
        )
        .eq("table_name", "pending_role_grants")
        .eq("record_id", grantId)
        .eq("action", "delete")
        .single();
      if (error) throw error;
      return data;
    }

    beforeAll(async () => {
      expiredGrantId = await createGrant(uniqueEmail("retention-invitee-old"));
      recentGrantId = await createGrant(uniqueEmail("retention-invitee-new"));
    });

    // First, because the sweep in the next test moves the clock past every entry
    // in the table, this one's included.
    test("an entry inside the window keeps its snapshot", async () => {
      await setMode("audit_log_snapshots", "enforce");
      await runPurge({ dryRun: false, asOf: clockAtYears(7, -1) });

      const entry = await snapshotFor(recentGrantId);
      expect(entry.old_data?.email).toEqual(expect.any(String));
      expect(entry.redacted_at).toBeNull();
    });

    test("the entry survives with the email cleared and the change intact", async () => {
      await setMode("audit_log_snapshots", "enforce");
      await runPurge({ dryRun: false, asOf: clockAtYears(7, 1) });

      const entry = await snapshotFor(expiredGrantId);

      // What the audit log is for, kept.
      expect(entry.table_name).toBe("pending_role_grants");
      expect(entry.record_id).toBe(expiredGrantId);
      expect(entry.action).toBe("delete");
      expect(entry.occurred_at).not.toBeNull();
      expect(entry.old_data?.status).toBe("pending");
      expect(entry.old_data?.role_id).not.toBeNull();

      // What it should not hold, gone -- with the key still there, so a reader
      // can tell a scrubbed field from one that did not exist yet.
      expect("email" in (entry.old_data ?? {})).toBe(true);
      expect(entry.old_data?.email).toBeNull();
      expect(entry.old_data?.name).toBeNull();
      expect(entry.redacted_at).not.toBeNull();
    });

    // Without the "is there anything left to scrub" test the sweep would rewrite
    // and re-report the same entries every night, forever.
    test("a second run finds nothing left to redact", async () => {
      await setMode("audit_log_snapshots", "enforce");
      const runId = await runPurge({
        dryRun: false,
        asOf: clockAtYears(7, 1),
      });

      const counts = await countsFor(runId, "audit_log_snapshots");
      expect(counts).toHaveLength(1);
      expect(counts[0].action).toBe("redacted");
      expect(counts[0].row_count).toBe(0);
    });

    test("the audit log is still append-only through the API", async () => {
      const { data } = await adminClient
        .from("audit_log")
        .update({ redacted_at: null })
        .eq("record_id", expiredGrantId)
        .select("id");
      expect(data ?? []).toHaveLength(0);
    });
  });

  describe("merge snapshots lose their personal keys", () => {
    let mergeId: string;
    let survivorId: string;

    beforeAll(async () => {
      const email = uniqueEmail("retention-merge");
      const survivor = await createPerson({
        name: "Retention Survivor",
        email,
      });
      const duplicate = await createPerson({
        name: "Retention Duplicate",
        email: uniqueEmail("retention-merge-dupe"),
      });
      survivorId = survivor.id;

      const { error } = await adminClient.rpc("merge_people", {
        p_survivor_id: survivor.id,
        p_duplicate_id: duplicate.id,
      });
      if (error) throw error;

      const { data, error: mergeError } = await serviceClient
        .from("person_merges")
        .select("id")
        .eq("survivor_person_id", survivor.id)
        .single();
      if (mergeError) throw mergeError;
      mergeId = data.id as string;

      cleanups.push(survivor.cleanup);
      cleanups.push(async () => {
        await serviceClient.from("person_merges").delete().eq("id", mergeId);
      });
    });

    async function mergeRow() {
      const { data, error } = await serviceClient
        .from("person_merges")
        .select(
          "survivor_person_id, merged_person_id, merged_at, repointed, merged_snapshot, survivor_before, redacted_at",
        )
        .eq("id", mergeId)
        .single();
      if (error) throw error;
      return data;
    }

    test("a merge inside the window keeps both snapshots", async () => {
      await setMode("person_merge_snapshots", "enforce");
      await runPurge({ dryRun: false, asOf: clockAtYears(7, -1) });

      const row = await mergeRow();
      expect(row.merged_snapshot?.name).toBe("Retention Duplicate");
      expect(row.redacted_at).toBeNull();
    });

    test("the record of the merge survives without the person's details", async () => {
      await setMode("person_merge_snapshots", "enforce");
      await runPurge({ dryRun: false, asOf: clockAtYears(7, 1) });

      const row = await mergeRow();

      // Who merged whom, when, and what moved: the reason the table exists.
      expect(row.survivor_person_id).toBe(survivorId);
      expect(row.merged_person_id).not.toBeNull();
      expect(row.merged_at).not.toBeNull();
      expect(row.repointed).not.toBeNull();

      expect(row.merged_snapshot?.name).toBeNull();
      expect(row.merged_snapshot?.email).toBeNull();
      expect(row.survivor_before?.name).toBeNull();
      expect(row.survivor_before?.email).toBeNull();
      // Not personal, and not registered: the shape of the row stays readable.
      expect(row.merged_snapshot?.id).not.toBeNull();
      expect(row.redacted_at).not.toBeNull();
    });
  });

  // "Does a deletion request reach the audit log?" -- #720's second open
  // question. It does, at the moment of the request rather than seven years
  // later, and without consulting the policy mode: the scheduled clocks are
  // proposals awaiting a board decision, while honouring a request is a
  // commitment /privacy already makes.
  describe("a deletion request reaches both copies immediately", () => {
    let personId: string;
    let donationId: string;
    let mergeId: string;

    beforeAll(async () => {
      const person = await createPerson({
        name: "Retention Requester",
        email: uniqueEmail("retention-request"),
      });
      personId = person.id;

      const duplicate = await createPerson({ name: "Retention Request Dupe" });
      const { error: mergeError } = await adminClient.rpc("merge_people", {
        p_survivor_id: person.id,
        p_duplicate_id: duplicate.id,
      });
      if (mergeError) throw mergeError;

      const { data: merge } = await serviceClient
        .from("person_merges")
        .select("id")
        .eq("survivor_person_id", person.id)
        .single();
      mergeId = merge!.id as string;

      // An audited row that both names this person and carries free text about
      // them, so its audit entry holds both. A gear movement would not do:
      // inventory_movements.notes is in audited_tables.redacted_columns
      // (20260905160000) and never reaches a snapshot in the first place.
      const { data, error } = await adminClient
        .from("donations")
        .insert({
          donor_id: person.id,
          donated_at: new Date().toISOString(),
          notes: "Dropping off two jackets on Saturday.",
        })
        .select("id")
        .single();
      if (error) throw error;
      donationId = data.id as string;

      cleanups.push(person.cleanup);
      cleanups.push(async () => {
        await serviceClient.from("person_merges").delete().eq("id", mergeId);
        // The request path records the subject on the run log, and
        // retention_run_tables.subject_person_id is a real foreign key -- so the
        // fixture person cannot be deleted until this evidence row goes.
        await serviceClient
          .from("retention_run_tables")
          .delete()
          .eq("subject_person_id", personId);
        // Takes the donor row with it, which is why person.cleanup above is
        // pushed first and so runs last: cleanups are replayed in reverse.
        await cleanupDonation(donationId);
      });
    });

    test("the request redacts the snapshots and records that it did", async () => {
      // Off, not merely dry_run: a request is not on a clock and is not gated
      // on the board having approved one.
      await setMode("audit_log_snapshots", "off");
      await setMode("person_merge_snapshots", "off");

      const { error } = await adminClient.rpc("delete_rider_profile", {
        p_person_id: personId,
        p_reason: "Asked us to delete their profile",
      });
      if (error) throw error;

      const { data: merge } = await serviceClient
        .from("person_merges")
        .select("merged_snapshot, survivor_before, redacted_at")
        .eq("id", mergeId)
        .single();
      expect(merge!.merged_snapshot?.name).toBeNull();
      expect(merge!.survivor_before?.name).toBeNull();
      expect(merge!.redacted_at).not.toBeNull();

      const { data: entry } = await serviceClient
        .from("audit_log")
        .select("new_data, record_id, redacted_at")
        .eq("table_name", "donations")
        .eq("record_id", donationId)
        .eq("action", "insert")
        .single();
      expect(entry!.new_data?.notes).toBeNull();
      // The id stays: the person row it points at is anonymized by the same
      // rules, and it is what still explains why the donation exists.
      expect(entry!.new_data?.donor_id).toBe(personId);
      expect(entry!.redacted_at).not.toBeNull();

      const { data: logged } = await adminClient
        .from("retention_run_tables")
        .select("policy_key, action, row_count, subject_person_id")
        .eq("subject_person_id", personId);
      const byPolicy = new Map(
        (logged ?? []).map((row) => [row.policy_key, row]),
      );
      expect(byPolicy.get("person_merge_snapshots")?.action).toBe("redacted");
      expect(byPolicy.get("person_merge_snapshots")?.row_count).toBe(1);
      expect(byPolicy.get("audit_log_snapshots")?.row_count).toBe(1);
    });
  });

  // The failure this design has, guarded rather than hoped about: an audited
  // table added next season whose personal columns nobody registered, whose
  // snapshots are then kept in full forever while the page reports the rule as
  // applied. Registering the column in the migration that audits the table is
  // what makes this pass again.
  test("every obviously personal column on an audited table is registered", async () => {
    const { data, error } = await serviceClient.rpc(
      "retention_unregistered_personal_columns",
    );
    if (error) throw error;
    expect(data ?? []).toEqual([]);
  });

  describe("authorization", () => {
    test("a coordinator cannot trigger a run", async () => {
      const client = await signInAs(SEEDED_USERS.coordinator);
      const { error } = await client.rpc("trigger_retention_run", {
        p_dry_run: true,
      });
      expect(error).not.toBeNull();
    });

    test("a coordinator cannot change a policy mode", async () => {
      const client = await signInAs(SEEDED_USERS.coordinator);
      const { error } = await client.rpc("set_retention_policy_mode", {
        p_policy_key: "contact_messages",
        p_mode: "enforce",
      });
      expect(error).not.toBeNull();
    });

    test("a volunteer cannot read the run log", async () => {
      const client = await signInAs(SEEDED_USERS.volunteer);
      const { data } = await client.from("retention_runs").select("id");
      expect(data ?? []).toHaveLength(0);
    });
  });
});
