// Integration test: exercises getAccessManagementStatsSummary against a real
// local Supabase stack.
//
// This is the Home dashboard's "Access management" tile. It has no permission
// check -- it takes a client and counts rows -- so `access_management_assets:
// view` in RLS (20260828070000/080000) is the only thing deciding what it
// returns. A count is exactly the shape of leak that is easy to miss: a role
// that cannot open the access-management page at all would still learn how
// many accounts and grants the organisation has if RLS ever loosened, and
// nothing would error.
//
// It also swallows its own errors (`count ?? 0`), so a broken query and an
// empty organisation look identical from the caller. That makes the positive
// case worth asserting on a known number rather than on "not zero".
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  anonClient,
  createPerson,
  signInAs,
} from "../../../../test/integration-setup";
import { getAccessManagementStatsSummary } from "./queries";

const serviceName = `IT Stats Service ${crypto.randomUUID()}`;
let serviceId: string;
let personId: string;
let personCleanup: () => Promise<void>;
let baseline: { assetsCount: number; activeGrantsCount: number };

beforeAll(async () => {
  const admin = await signInAs(SEEDED_USERS.admin);
  baseline = await getAccessManagementStatsSummary(admin);

  const { data: service, error: serviceError } = await adminClient
    .from("services")
    .insert({ name: serviceName })
    .select("id")
    .single();
  if (serviceError) throw serviceError;
  serviceId = service.id as string;

  const person = await createPerson();
  personId = person.id;
  personCleanup = person.cleanup;

  // One active asset and one decommissioned one; one active grant and one
  // revoked. Only the active rows should move the tile.
  const { data: assets, error: assetError } = await adminClient
    .from("assets")
    .insert([
      {
        name: `IT Stats Asset active ${serviceName}`,
        service_id: serviceId,
        category: "hosting",
        status: "active",
      },
      {
        name: `IT Stats Asset gone ${serviceName}`,
        service_id: serviceId,
        category: "hosting",
        status: "decommissioned",
      },
    ])
    .select("id");
  if (assetError) throw assetError;

  const { error: grantError } = await adminClient.from("access_grants").insert([
    {
      asset_id: assets[0].id as string,
      person_id: personId,
      access_level: "admin",
      status: "active",
    },
    {
      asset_id: assets[1].id as string,
      person_id: personId,
      access_level: "viewer",
      status: "revoked",
    },
  ]);
  if (grantError) throw grantError;
});

afterAll(async () => {
  await adminClient.from("access_grants").delete().eq("person_id", personId);
  await adminClient.from("assets").delete().eq("service_id", serviceId);
  await adminClient.from("services").delete().eq("id", serviceId);
  await personCleanup();
});

describe("getAccessManagementStatsSummary (integration)", () => {
  test("counts only active assets and active grants", async () => {
    const summary = await getAccessManagementStatsSummary(
      await signInAs(SEEDED_USERS.admin),
    );

    // Exactly one of each fixture pair is active, so the deltas pin that the
    // status filters are doing their job -- a summary that counted every row
    // would be two higher on both.
    expect(summary.assetsCount).toBe(baseline.assetsCount + 1);
    expect(summary.activeGrantsCount).toBe(baseline.activeGrantsCount + 1);
  });

  test.each([
    ["coordinator", SEEDED_USERS.coordinator],
    ["finance", SEEDED_USERS.finance],
    ["board", SEEDED_USERS.board],
    ["volunteer", SEEDED_USERS.volunteer],
    ["multi", SEEDED_USERS.multi],
    ["noAccess", SEEDED_USERS.noAccess],
    ["former", SEEDED_USERS.former],
  ])(
    "%s (no access_management_assets grant) is told nothing, not a real count",
    async (_label, email) => {
      const summary = await getAccessManagementStatsSummary(
        await signInAs(email),
      );

      expect(summary).toEqual({ assetsCount: 0, activeGrantsCount: 0 });
    },
  );

  test("an anonymous session gets zeroes rather than the organisation's totals", async () => {
    const summary = await getAccessManagementStatsSummary(anonClient());

    expect(summary).toEqual({ assetsCount: 0, activeGrantsCount: 0 });
  });
});
