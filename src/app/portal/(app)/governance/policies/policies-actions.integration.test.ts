// Integration test: exercises the real policy Server Actions against a real
// local Supabase stack (checkUser/checkPermission, then real `policies` RLS).
// The page shares the `governance` resource key with the rest of governance
// (board manages, every other role is 'none'); what is unproven until here
// is that these actions ask for that key at the right level. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  signInAs,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { createPolicyAction, updatePolicyAction } =
  await import("./policies-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

// `policies` has no natural unique key and the seed may hold rows of its
// own, so each test tags its row with a random name and looks that up.
function policyForm(name: string, overrides: { version?: string } = {}) {
  const fd = new FormData();
  fd.set("name", name);
  fd.set("category", "financial");
  fd.set("effectiveDate", "2026-02-01");
  fd.set("version", overrides.version ?? "1.0");
  fd.set("externalLink", "https://example.test/policy.pdf");
  fd.set("bodyText", "Reimbursements are approved by the treasurer.");
  return fd;
}

function uniqueName() {
  return `IT Policy ${crypto.randomUUID()}`;
}

async function policyRowFor(name: string) {
  const { data, error } = await adminClient
    .from("policies")
    .select("id, name, category, effective_date, version, external_link")
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function seedPolicy(name: string) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await createPolicyAction(policyForm(name));
  if ("error" in result) throw new Error(result.error);
  const row = await policyRowFor(name);
  if (!row) throw new Error("expected a seeded policy row");
  return row.id as string;
}

async function cleanupPolicy(name: string) {
  await adminClient.from("policies").delete().eq("name", name);
}

describe("policy actions (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();

    expect(await createPolicyAction(policyForm(uniqueName()))).toEqual({
      error: "You must be signed in to add a policy.",
    });
    expect(
      await updatePolicyAction(crypto.randomUUID(), policyForm(uniqueName())),
    ).toEqual({ error: "You must be signed in to update this policy." });
  });

  test("admin role (governance manage) can add and update a policy", async () => {
    const name = uniqueName();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createPolicyAction(policyForm(name))).toEqual({
      success: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/governance/policies",
    );

    const created = await policyRowFor(name);
    if (!created) throw new Error("expected the created policy row");
    expect(created).toMatchObject({
      category: "financial",
      effective_date: "2026-02-01",
      version: "1.0",
      external_link: "https://example.test/policy.pdf",
    });

    expect(
      await updatePolicyAction(
        created.id as string,
        policyForm(name, { version: "2.0" }),
      ),
    ).toEqual({ success: true });

    expect(await policyRowFor(name)).toMatchObject({ version: "2.0" });

    await cleanupPolicy(name);
  });

  test("board role (governance manage) can add a policy", async () => {
    const name = uniqueName();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await createPolicyAction(policyForm(name))).toEqual({
      success: true,
    });

    await cleanupPolicy(name);
  });

  test("rejects a policy with no version, even for a permitted role", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);
    const fd = policyForm(uniqueName());
    fd.set("version", "");

    expect(await createPolicyAction(fd)).toEqual({
      error: "Version is required.",
    });
  });

  async function expectNoAccess(email: string) {
    const name = uniqueName();
    const id = await seedPolicy(name);
    currentSupabase = await signInAs(email);

    expect(await createPolicyAction(policyForm(uniqueName()))).toEqual(DENIED);
    expect(
      await updatePolicyAction(id, policyForm(name, { version: "9.9" })),
    ).toEqual(DENIED);

    // The denied update must not have landed: the action refuses it, and the
    // `policies update` policy would too.
    expect(await policyRowFor(name)).toMatchObject({ version: "1.0" });

    await cleanupPolicy(name);
  }

  test("event_coordinator role cannot add or update policies", async () => {
    await expectNoAccess(SEEDED_USERS.coordinator);
  });

  test("finance role cannot add or update policies", async () => {
    await expectNoAccess(SEEDED_USERS.finance);
  });

  test("volunteer role cannot add or update policies", async () => {
    await expectNoAccess(SEEDED_USERS.volunteer);
  });

  test("a deactivated (former) account cannot add or update policies", async () => {
    await expectNoAccess(SEEDED_USERS.former);
  });
});
