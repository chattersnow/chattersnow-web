// Integration test: exercises the real grant Server Actions against a real
// local Supabase stack (checkUser/checkPermission, then real `grants` RLS).
// Grants share the `governance` resource key with the rest of governance
// (admin and board manage; every other seeded role is 'none'); what is
// unproven until here is that these actions ask for that key at the right
// level, and that RLS refuses a write the action layer would have let
// through. Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPerson,
  signInAs,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { createGrantAction, updateGrantAction } =
  await import("./grants-actions");

afterEach(() => {
  revalidatePathMock.mockClear();
});

const DENIED = { error: "You don't have permission to perform this action." };

// `grants` has no natural unique key and the seed holds rows of its own, so
// each test tags its row with a random funder name and looks that up.
function uniqueFunder() {
  return `IT Funder ${crypto.randomUUID()}`;
}

function grantForm(
  funderName: string,
  overrides: {
    amount?: string;
    applicationDeadline?: string;
    status?: string;
    notes?: string;
  } = {},
) {
  const fd = new FormData();
  fd.set("funderName", funderName);
  fd.set("amount", overrides.amount ?? "25000");
  fd.set("applicationDeadline", overrides.applicationDeadline ?? "2026-11-30");
  fd.set("status", overrides.status ?? "planned");
  fd.set("notes", overrides.notes ?? "Seeded by the integration suite.");
  return fd;
}

async function grantRowFor(funderName: string) {
  const { data, error } = await adminClient
    .from("grants")
    .select(
      "id, funder_name, amount, application_deadline, status, notes, owner_person_id",
    )
    .eq("funder_name", funderName)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function seedGrant(
  funderName: string,
  ownerPersonId: string | null = null,
) {
  currentSupabase = await signInAs(SEEDED_USERS.admin);
  const result = await createGrantAction(ownerPersonId, grantForm(funderName));
  if ("error" in result) throw new Error(result.error);
  const row = await grantRowFor(funderName);
  if (!row) throw new Error("expected a seeded grant row");
  return row.id as string;
}

async function cleanupGrant(funderName: string) {
  await adminClient.from("grants").delete().eq("funder_name", funderName);
}

describe("grant actions (integration)", () => {
  test("requires a signed-in user", async () => {
    currentSupabase = anonClient();

    expect(await createGrantAction(null, grantForm(uniqueFunder()))).toEqual({
      error: "You must be signed in to add a grant.",
    });
    expect(
      await updateGrantAction(
        crypto.randomUUID(),
        null,
        grantForm(uniqueFunder()),
      ),
    ).toEqual({ error: "You must be signed in to update this grant." });
  });

  test("admin role (governance manage) can add and update a grant", async () => {
    const funderName = uniqueFunder();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createGrantAction(null, grantForm(funderName))).toEqual({
      success: true,
    });

    const created = await grantRowFor(funderName);
    expect(created).not.toBeNull();
    expect(created!.status).toBe("planned");
    expect(Number(created!.amount)).toBe(25000);

    expect(
      await updateGrantAction(
        created!.id as string,
        null,
        grantForm(funderName, { status: "submitted", amount: "31000" }),
      ),
    ).toEqual({ success: true });

    const updated = await grantRowFor(funderName);
    expect(updated!.status).toBe("submitted");
    expect(Number(updated!.amount)).toBe(31000);

    await cleanupGrant(funderName);
  });

  test("board role (governance manage) can add a grant", async () => {
    const funderName = uniqueFunder();
    currentSupabase = await signInAs(SEEDED_USERS.board);

    expect(await createGrantAction(null, grantForm(funderName))).toEqual({
      success: true,
    });
    expect(await grantRowFor(funderName)).not.toBeNull();

    await cleanupGrant(funderName);
  });

  test("stores the owner person on the grant", async () => {
    const funderName = uniqueFunder();
    const owner = await createPerson();

    currentSupabase = await signInAs(SEEDED_USERS.admin);
    expect(await createGrantAction(owner.id, grantForm(funderName))).toEqual({
      success: true,
    });

    expect((await grantRowFor(funderName))!.owner_person_id).toBe(owner.id);

    await cleanupGrant(funderName);
    await owner.cleanup();
  });

  test.each([
    ["coordinator", SEEDED_USERS.coordinator],
    ["finance", SEEDED_USERS.finance],
    ["volunteer", SEEDED_USERS.volunteer],
    ["noAccess", SEEDED_USERS.noAccess],
    ["former", SEEDED_USERS.former],
  ])(
    "%s role (no governance access) cannot add a grant",
    async (_label, email) => {
      const funderName = uniqueFunder();
      currentSupabase = await signInAs(email);

      expect(await createGrantAction(null, grantForm(funderName))).toEqual(
        DENIED,
      );
      expect(await grantRowFor(funderName)).toBeNull();
    },
  );

  test("a role without governance access cannot update someone else's grant", async () => {
    const funderName = uniqueFunder();
    const id = await seedGrant(funderName);

    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    expect(
      await updateGrantAction(
        id,
        null,
        grantForm(funderName, { status: "awarded" }),
      ),
    ).toEqual(DENIED);

    expect((await grantRowFor(funderName))!.status).toBe("planned");

    await cleanupGrant(funderName);
  });

  test("a grant the caller cannot see is not silently created by an update", async () => {
    // PostgREST reports a filtered-out update as a success with zero rows,
    // so the action returns { success: true } for an id that matches nothing.
    // The point of this test is the inverse: no row is invented.
    const funderName = uniqueFunder();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(
      await updateGrantAction(crypto.randomUUID(), null, grantForm(funderName)),
    ).toEqual({ success: true });
    expect(await grantRowFor(funderName)).toBeNull();
  });

  test("a malformed form is refused before the insert", async () => {
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    expect(await createGrantAction(null, grantForm(""))).toEqual({
      error: "Funder name is required.",
    });

    const funderName = uniqueFunder();
    expect(
      await createGrantAction(
        null,
        grantForm(funderName, { status: "not-a-status" }),
      ),
    ).toEqual({ error: "Invalid status." });
    expect(
      await createGrantAction(null, grantForm(funderName, { amount: "-5" })),
    ).toEqual({ error: "Amount must be a positive number." });

    expect(await grantRowFor(funderName)).toBeNull();
  });

  test("revalidates the grants list and the dashboard after a write", async () => {
    const funderName = uniqueFunder();
    currentSupabase = await signInAs(SEEDED_USERS.admin);

    await createGrantAction(null, grantForm(funderName));

    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/portal/governance/grants",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/home");

    await cleanupGrant(funderName);
  });
});
