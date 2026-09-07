// Integration test: exercises the access-management read helpers against a
// real local Supabase stack.
//
// `actions.integration.test.ts` alongside this file already covers
// listAssets/getAssetDetail/listAccessGrantsForAsset. The four helpers here
// were not covered by anything, and they are the ones with no permission
// check of their own: each takes a client and leans entirely on
// `access_management_assets:view` in RLS (20260828070000/080000). That makes
// "a role without the grant sees an empty list, not somebody else's
// inventory of accounts" the property worth pinning -- an RLS regression
// would show up here as data appearing, with no error to notice.
//
// Requires `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  SEEDED_USERS,
  adminClient,
  createPerson,
  signInAs,
} from "../../../../../../test/integration-setup";
import {
  listActiveGrantCountsByAsset,
  listPeopleForAccessManagement,
  listServices,
  listServicesWithAssetCounts,
} from "./queries";

// Every seeded role except admin: none of them hold
// access_management_assets at any level.
const ROLES_WITHOUT_ACCESS = [
  ["coordinator", SEEDED_USERS.coordinator],
  ["finance", SEEDED_USERS.finance],
  ["board", SEEDED_USERS.board],
  ["volunteer", SEEDED_USERS.volunteer],
  ["multi", SEEDED_USERS.multi],
  ["noAccess", SEEDED_USERS.noAccess],
  ["former", SEEDED_USERS.former],
] as const;

const serviceName = `IT Service ${crypto.randomUUID()}`;
let serviceId: string;
let assetId: string;
let quietAssetId: string;
let personId: string;
let personCleanup: () => Promise<void>;

beforeAll(async () => {
  const { data: service, error: serviceError } = await adminClient
    .from("services")
    .insert({ name: serviceName, website: "https://example.test" })
    .select("id")
    .single();
  if (serviceError) throw serviceError;
  serviceId = service.id as string;

  const { data: assets, error: assetError } = await adminClient
    .from("assets")
    .insert([
      {
        name: `IT Asset A ${serviceName}`,
        service_id: serviceId,
        category: "hosting",
      },
      {
        name: `IT Asset B ${serviceName}`,
        service_id: serviceId,
        category: "domain",
      },
    ])
    .select("id");
  if (assetError) throw assetError;
  assetId = assets[0].id as string;
  quietAssetId = assets[1].id as string;

  const person = await createPerson();
  personId = person.id;
  personCleanup = person.cleanup;

  // One active grant on the first asset, one revoked grant on the second, so
  // the count helper has both a row to count and a row it must skip.
  // `status` is spelled out on both rows: a PostgREST batch insert sends the
  // union of the keys, so omitting it on one row posts an explicit null and
  // trips the not-null constraint rather than falling back to the default.
  const { error: grantError } = await adminClient.from("access_grants").insert([
    {
      asset_id: assetId,
      person_id: personId,
      access_level: "admin",
      status: "active",
    },
    {
      asset_id: quietAssetId,
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

describe("listServices (integration)", () => {
  test("admin sees the service", async () => {
    const result = await listServices(await signInAs(SEEDED_USERS.admin));
    if ("error" in result) throw new Error(result.error);

    expect(result.data.map((row) => row.name)).toContain(serviceName);
  });

  test.each(ROLES_WITHOUT_ACCESS)(
    "%s sees nothing at all",
    async (_label, email) => {
      const result = await listServices(await signInAs(email));
      if ("error" in result) throw new Error(result.error);

      // RLS filters rather than errors, so the assertion has to be on the
      // rows: an empty list is the pass, any row at all is a leak.
      expect(result.data).toEqual([]);
    },
  );
});

describe("listServicesWithAssetCounts (integration)", () => {
  test("counts the assets belonging to each service", async () => {
    const result = await listServicesWithAssetCounts(
      await signInAs(SEEDED_USERS.admin),
    );
    if ("error" in result) throw new Error(result.error);

    const row = result.data.find((service) => service.name === serviceName);
    expect(row).toBeDefined();
    expect(row!.assetCount).toBe(2);
  });

  test("a service with no assets counts zero rather than going missing", async () => {
    const emptyName = `IT Empty Service ${crypto.randomUUID()}`;
    const { data, error } = await adminClient
      .from("services")
      .insert({ name: emptyName })
      .select("id")
      .single();
    if (error) throw error;

    const result = await listServicesWithAssetCounts(
      await signInAs(SEEDED_USERS.admin),
    );
    if ("error" in result) throw new Error(result.error);

    const row = result.data.find((service) => service.name === emptyName);
    expect(row).toBeDefined();
    expect(row!.assetCount).toBe(0);

    await adminClient
      .from("services")
      .delete()
      .eq("id", data.id as string);
  });

  test.each(ROLES_WITHOUT_ACCESS)(
    "%s sees no services and therefore no counts",
    async (_label, email) => {
      const result = await listServicesWithAssetCounts(await signInAs(email));
      if ("error" in result) throw new Error(result.error);

      expect(result.data).toEqual([]);
    },
  );
});

describe("listActiveGrantCountsByAsset (integration)", () => {
  test("counts only active grants", async () => {
    const counts = await listActiveGrantCountsByAsset(
      await signInAs(SEEDED_USERS.admin),
    );

    expect(counts[assetId]).toBe(1);
    // The one grant on this asset is revoked, so it must not appear at all
    // rather than appear as zero.
    expect(counts[quietAssetId]).toBeUndefined();
  });

  test.each(ROLES_WITHOUT_ACCESS)(
    "%s gets an empty map, not a count of grants they cannot see",
    async (_label, email) => {
      const counts = await listActiveGrantCountsByAsset(await signInAs(email));

      expect(counts[assetId]).toBeUndefined();
      expect(Object.keys(counts)).toEqual([]);
    },
  );
});

describe("listPeopleForAccessManagement (integration)", () => {
  test("admin can list people to grant access to", async () => {
    const result = await listPeopleForAccessManagement(
      await signInAs(SEEDED_USERS.admin),
    );
    if ("error" in result) throw new Error(result.error);

    expect(result.data.map((person) => person.id)).toContain(personId);
  });

  test.each([
    ["noAccess", SEEDED_USERS.noAccess],
    ["former", SEEDED_USERS.former],
  ])(
    "%s (nothing at all) cannot use this to read the directory",
    async (_label, email) => {
      // This helper deliberately skips listPeopleAction's permission checks so
      // that an access-management-only role isn't wrongly denied. That makes
      // `people` RLS the only thing confining it, which is what this asserts.
      const result = await listPeopleForAccessManagement(await signInAs(email));
      if ("error" in result) throw new Error(result.error);

      expect(result.data).toEqual([]);
    },
  );

  test.each([
    ["volunteer", SEEDED_USERS.volunteer, "people_intake:manage"],
    ["board", SEEDED_USERS.board, "reimbursement_approvals:manage"],
  ])(
    "%s reaches the whole directory through the %s carve-out",
    async (_label, email) => {
      // Pinning current behaviour, not endorsing it. The "people select"
      // policy widens past people:view twice -- for people_intake
      // (20260823160000) and for reimbursement_approvals (20260826000000) --
      // each added so an embedded people(name, email) join would not come
      // back null for those roles. Because this helper has no permission
      // check of its own, the same carve-outs let those roles read every
      // column it selects, for every person, not just the rows their feature
      // joins to. If either carve-out is ever narrowed, this test is the one
      // that should fail and be updated deliberately.
      const result = await listPeopleForAccessManagement(await signInAs(email));
      if ("error" in result) throw new Error(result.error);

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.map((person) => person.id)).toContain(personId);
    },
  );
});
