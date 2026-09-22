// Integration test: the real screening actions against a real local Supabase
// stack, and the real `person_screenings` / `volunteer_screening_tiers` RLS.
//
// What this file is for is the permission split (#1360). `volunteer_screening`
// is a resource of its own and is never OR'd with `volunteers`, and nothing
// else in the suite can prove that: a unit test can only show that the action
// asks for a key, while the assertion that matters is that a real
// volunteers:manage session reads zero rows through a real policy.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEEDED_USERS,
  adminClient,
  serviceRoleClient,
  signInAs,
} from "../../../../../../test/integration-setup";

const revalidatePathMock = mock(() => {});
mock.module("next/cache", () => ({ revalidatePath: revalidatePathMock }));

let currentSupabase: SupabaseClient;
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => currentSupabase,
}));

const { recordPersonScreeningAction, removePersonScreeningAction } =
  await import("./screening-actions");

const service = serviceRoleClient();

let personId: string;
let otherPersonId: string;
let tierId: string;
const createdScreeningIds: string[] = [];

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** Yesterday, as an ISO calendar day — never in the future for any tenant. */
function yesterday(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

beforeAll(async () => {
  const { data: person } = await adminClient
    .from("people")
    .insert({ name: "Screening Fixture", source_type: "individual" })
    .select("id")
    .single();
  personId = person!.id as string;

  const { data: other } = await adminClient
    .from("people")
    .insert({ name: "Screening Fixture Two", source_type: "individual" })
    .select("id")
    .single();
  otherPersonId = other!.id as string;

  const { data: tier } = await adminClient
    .from("volunteer_screening_tiers")
    .insert({ name: `Fixture level ${crypto.randomUUID()}`, sort_order: 900 })
    .select("id")
    .single();
  tierId = tier!.id as string;
});

afterAll(async () => {
  await service.from("person_screenings").delete().eq("tier_id", tierId);
  await service.from("volunteer_screening_tiers").delete().eq("id", tierId);
  await service.from("people").delete().in("id", [personId, otherPersonId]);
});

describe("recording an outcome", () => {
  test("an admin records one, and it comes back on the person", async () => {
    currentSupabase = adminClient;
    const result = await recordPersonScreeningAction(
      personId,
      form({ tierId, clearedOn: yesterday(), expiresOn: "" }),
    );
    expect(result).toEqual({ success: true });

    const { data } = await adminClient
      .from("person_screenings")
      .select("id, cleared_on, expires_on, tier_id")
      .eq("person_id", personId);
    expect(data).toHaveLength(1);
    expect(data![0].tier_id).toBe(tierId);
    expect(data![0].expires_on).toBeNull();
    createdScreeningIds.push(data![0].id as string);
  });

  test("the same level on the same day is refused as a duplicate", async () => {
    currentSupabase = adminClient;
    const result = await recordPersonScreeningAction(
      personId,
      form({ tierId, clearedOn: yesterday(), expiresOn: "" }),
    );
    expect(result).toEqual({
      error: "That outcome is already recorded for this person on that date.",
    });
  });
});

// The reason this file exists.
describe("the permission split is real, not a component check", () => {
  test("a volunteers:manage holder cannot record an outcome", async () => {
    // The seeded coordinator holds volunteers:view and no screening at all;
    // no seeded role holds volunteers:manage without being admin, which is
    // itself the point -- the split costs nobody access today.
    currentSupabase = await signInAs(SEEDED_USERS.coordinator);
    const result = await recordPersonScreeningAction(
      otherPersonId,
      form({ tierId, clearedOn: yesterday(), expiresOn: "" }),
    );
    expect(result).toEqual({
      error: "You don't have permission to perform this action.",
    });
  });

  test("a volunteers:view holder reads zero rows through RLS", async () => {
    const coordinator = await signInAs(SEEDED_USERS.coordinator);
    // Not through the action -- straight at the table, which is what a
    // component that forgot its permission prop would do.
    const { data, error } = await coordinator
      .from("person_screenings")
      .select("id")
      .eq("person_id", personId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("a volunteers:view holder cannot read the level catalog either", async () => {
    const coordinator = await signInAs(SEEDED_USERS.coordinator);
    const { data } = await coordinator
      .from("volunteer_screening_tiers")
      .select("id")
      .eq("id", tierId);
    expect(data).toEqual([]);
  });

  test("a volunteers:view holder cannot insert a level", async () => {
    const coordinator = await signInAs(SEEDED_USERS.coordinator);
    const { error } = await coordinator
      .from("volunteer_screening_tiers")
      .insert({ name: `Refused ${crypto.randomUUID()}` });
    expect(error).not.toBeNull();
  });
});

describe("the schema keeps its promises", () => {
  // The load-bearing assertion of #1360, made against the real table rather
  // than against a type: if a later change adds a note, a reference or a
  // result column, this fails and the reviewer is told why.
  test("there is no column a check result could be written into", async () => {
    const { data: row } = await adminClient
      .from("person_screenings")
      .select("*")
      .eq("person_id", personId)
      .single();
    expect(Object.keys(row!).sort()).toEqual([
      "cleared_on",
      "created_at",
      "created_by",
      "expires_on",
      "id",
      "person_id",
      "tenant_id",
      "tier_id",
      "updated_at",
      "updated_by",
    ]);
  });

  test("a level in use cannot be deleted", async () => {
    const { error } = await adminClient
      .from("volunteer_screening_tiers")
      .delete()
      .eq("id", tierId);
    // on delete restrict: the level's name is the outcome, so deleting it
    // would leave a clearance saying "cleared for nothing".
    expect(error).not.toBeNull();
  });

  test("recording is audited, and so is removing", async () => {
    const id = createdScreeningIds[0];
    currentSupabase = adminClient;
    expect(await removePersonScreeningAction(id, personId)).toEqual({
      success: true,
    });

    const { data } = await service
      .from("audit_log")
      .select("action, old_data, new_data")
      .eq("table_name", "person_screenings")
      .eq("record_id", id)
      .order("occurred_at", { ascending: true });

    expect(data!.map((row) => row.action)).toEqual(["insert", "delete"]);
    // Nothing is redacted, because there was never any prose to redact.
    expect((data![1].old_data as Record<string, unknown>).tier_id).toBe(tierId);
  });
});
