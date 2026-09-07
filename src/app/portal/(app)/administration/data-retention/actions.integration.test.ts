// Integration test: exercises the two data-retention Server Actions against a
// real local Supabase stack.
//
// `retention.integration.test.ts` alongside this file covers the policy layer
// -- what the purge functions select and what they leave behind. What was
// untested is the pair of actions the portal actually calls: the one that
// triggers a run, and the one that takes a rule out of dry run. The second is
// the control that makes the purge destructive (#722), so the checks here are
// the ones standing between a non-admin and live donor/participant data:
// both actions must be refused for anyone without administration:manage, and
// the trigger must never be able to start a run that is not a dry run.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  serviceRoleClient,
  signInAs,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { runRetentionDryRunAction, setRetentionPolicyModeAction } =
  await import("./actions");

const service = serviceRoleClient();

const DENIED = { error: "You don't have permission to perform this action." };

// One rule to flip, chosen because its two-year period cannot select a real
// row inside a test run. `mode` defaults to 'dry_run' (20260905090000), but a
// developer may have moved it, so the baseline is read rather than assumed --
// every "was not changed" assertion below compares against it, and afterAll
// puts it back.
const POLICY_KEY = "contact_messages";
let baselineMode: string;

beforeAll(async () => {
  baselineMode = await modeOf(POLICY_KEY);
});

afterEach(() => {
  revalidatePathMock.mockClear();
});

afterAll(async () => {
  await service
    .from("retention_policies")
    .update({ mode: baselineMode })
    .eq("policy_key", POLICY_KEY)
    .eq("tenant_id", await tenantId());
});

/**
 * The tenant the actions under test answer for. Named explicitly because
 * `service` bypasses RLS and, since #707 Phase 5b, there is one policy row per
 * policy *per tenant* -- an unscoped read is only ever right by accident, on a
 * database that happens to hold one tenant.
 */
let seededTenantId: string | null = null;
async function tenantId(): Promise<string> {
  if (seededTenantId) return seededTenantId;
  const { data, error } = await service
    .from("tenants")
    .select("id")
    .order("created_at")
    .limit(1)
    .single();
  if (error) throw error;
  seededTenantId = data.id as string;
  return seededTenantId;
}

async function modeOf(policyKey: string) {
  const { data, error } = await service
    .from("retention_policies")
    .select("mode")
    .eq("policy_key", policyKey)
    .eq("tenant_id", await tenantId())
    .single();
  if (error) throw error;
  return data.mode as string;
}

async function latestRun() {
  const { data, error } = await adminClient
    .from("retention_runs")
    .select("id, dry_run, trigger, status")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

describe("runRetentionDryRunAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();

    expect(await runRetentionDryRunAction()).toEqual({
      error: "You must be signed in to run a retention preview.",
    });
  });

  test("admin role (administration manage) can run a preview", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await runRetentionDryRunAction()).toEqual({ success: true });

    const run = await latestRun();
    expect(run).not.toBeNull();
    expect(run!.trigger).toBe("manual");
  });

  test("the run it starts is always a dry run", async () => {
    // There is deliberately no action that purges for real; this pins that
    // property to the run log rather than to a code comment.
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    await runRetentionDryRunAction();

    expect((await latestRun())!.dry_run).toBe(true);
  });

  test.each([
    ["coordinator", SEEDED_USERS.coordinator],
    ["finance", SEEDED_USERS.finance],
    ["board", SEEDED_USERS.board],
    ["volunteer", SEEDED_USERS.volunteer],
    ["noAccess", SEEDED_USERS.noAccess],
    ["former", SEEDED_USERS.former],
  ])(
    "%s role (no administration access) cannot run a preview",
    async (_label, email) => {
      const before = await latestRun();
      currentSupabase = await signInAs(email);

      expect(await runRetentionDryRunAction()).toEqual(DENIED);

      // Refused at the action, so no run was logged at all.
      expect((await latestRun())?.id ?? null).toBe(before?.id ?? null);
    },
  );

  test("board's system_settings:manage does not reach retention", async () => {
    // board holds system_settings:manage, which is the nearest-looking grant
    // to this page. Retention is gated on `administration`, and this is what
    // keeps the two apart.
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await runRetentionDryRunAction()).toEqual(DENIED);
  });
});

describe("setRetentionPolicyModeAction (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();

    expect(await setRetentionPolicyModeAction(POLICY_KEY, "dry_run")).toEqual({
      error: "You must be signed in to change a retention policy.",
    });
    expect(await modeOf(POLICY_KEY)).toBe(baselineMode);
  });

  test("admin can move a policy through off, dry run and enforce", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await setRetentionPolicyModeAction(POLICY_KEY, "dry_run")).toEqual({
      success: true,
    });
    expect(await modeOf(POLICY_KEY)).toBe("dry_run");

    expect(await setRetentionPolicyModeAction(POLICY_KEY, "enforce")).toEqual({
      success: true,
    });
    expect(await modeOf(POLICY_KEY)).toBe("enforce");

    expect(await setRetentionPolicyModeAction(POLICY_KEY, "off")).toEqual({
      success: true,
    });
    expect(await modeOf(POLICY_KEY)).toBe("off");

    // Put it back so the "was not changed" assertions in the tests below
    // still compare against the baseline this file started from.
    await setRetentionPolicyModeAction(POLICY_KEY, baselineMode);
  });

  test("an unknown mode is refused before the RPC", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await setRetentionPolicyModeAction(POLICY_KEY, "purge")).toEqual({
      error: "Unknown retention mode.",
    });
    expect(await setRetentionPolicyModeAction(POLICY_KEY, "ENFORCE")).toEqual({
      error: "Unknown retention mode.",
    });
    expect(await modeOf(POLICY_KEY)).toBe(baselineMode);
  });

  test("an unknown policy key is reported, not silently ignored", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await setRetentionPolicyModeAction("not-a-policy", "enforce"),
    ).toEqual({
      error: "Could not update this retention policy. Please try again.",
    });
  });

  test.each([
    ["coordinator", SEEDED_USERS.coordinator],
    ["finance", SEEDED_USERS.finance],
    ["board", SEEDED_USERS.board],
    ["volunteer", SEEDED_USERS.volunteer],
    ["noAccess", SEEDED_USERS.noAccess],
    ["former", SEEDED_USERS.former],
  ])(
    "%s role (no administration access) cannot turn a policy on",
    async (_label, email) => {
      currentSupabase = await signInAs(email);

      expect(await setRetentionPolicyModeAction(POLICY_KEY, "enforce")).toEqual(
        DENIED,
      );
      expect(await modeOf(POLICY_KEY)).toBe(baselineMode);
    },
  );

  test("the RPC refuses a non-admin even when the action gate is bypassed", async () => {
    // The action's checkPermission is not the only guard: set_retention_policy_mode
    // re-checks administration:manage itself, so a caller reaching the RPC
    // directly -- a future call site that forgets the check -- is still refused.
    const coordinator = await signInAs(SEEDED_USERS.coordinator);

    const { error } = await coordinator.rpc("set_retention_policy_mode", {
      p_policy_key: POLICY_KEY,
      p_mode: "enforce",
    });

    expect(error).not.toBeNull();
    expect(await modeOf(POLICY_KEY)).toBe(baselineMode);
  });

  test("revalidates the retention page after a change", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    await setRetentionPolicyModeAction(POLICY_KEY, "enforce");

    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/administration/data-retention",
    );

    await setRetentionPolicyModeAction(POLICY_KEY, baselineMode);
  });

  test("does not revalidate when the mode was rejected", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    await setRetentionPolicyModeAction(POLICY_KEY, "purge");

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
