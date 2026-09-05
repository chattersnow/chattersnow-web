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
import {
  SEEDED_USERS,
  adminClient,
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

async function runPurge(options: {
  dryRun: boolean;
  asOf: string;
}): Promise<string> {
  const { data, error } = await serviceClient.rpc("run_retention_purge", {
    p_dry_run: options.dryRun,
    p_as_of: options.asOf,
    p_trigger: "manual",
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
      .select("policy_key");
    for (const policy of policies ?? []) {
      await setMode(policy.policy_key, "dry_run");
    }
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
