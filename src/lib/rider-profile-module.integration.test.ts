// Integration test (#1408): the rider profile as an add-on module, against a
// real local Supabase stack. Requires `bun run db:start && bun run db:reset`
// first; run via `bun run test:integration`. Not picked up by `bun run test`.
//
// The seeded tenant has the module on (supabase/seed.sql), standing in for
// Chatter Snow; every "off" case switches it and switches it back.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  adminClient,
  anonClient,
  removeModuleRow,
  seededTenantId,
  serviceRoleClient,
  withModule,
} from "../../test/integration-setup";

const service = serviceRoleClient();
const SETTING = "rider_profile.preferred_mountains";

let tenantId: string;
let storedList: unknown;

beforeAll(async () => {
  tenantId = await seededTenantId();
  const { data } = await service
    .from("app_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", SETTING)
    .maybeSingle();
  storedList = data?.value ?? null;
});

afterAll(async () => {
  // Leave the list as the seed had it: the e2e registration spec picks from it.
  if (storedList === null) {
    await service
      .from("app_settings")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("key", SETTING);
  } else {
    await service
      .from("app_settings")
      .upsert(
        { tenant_id: tenantId, key: SETTING, value: storedList },
        { onConflict: "tenant_id,key" },
      );
  }
});

function off(body: () => Promise<void>) {
  return withModule(tenantId, "rider_profile", false, body);
}

describe("the module", () => {
  test("is off for a tenant that has said nothing about it", async () => {
    const restore = await removeModuleRow(tenantId, "rider_profile");
    try {
      const { data } = await adminClient.rpc("tenant_module_enabled", {
        p_module_key: "rider_profile",
      });
      expect(data).toBe(false);
    } finally {
      await restore();
    }
  });

  test("takes the rider_profiles permission with it", async () => {
    const on = await adminClient.rpc("has_permission", {
      p_resource_key: "rider_profiles",
      p_min_level: "manage",
    });
    expect(on.data).toBe(true);

    await off(async () => {
      const { data } = await adminClient.rpc("has_permission", {
        p_resource_key: "rider_profiles",
        p_min_level: "view",
      });
      expect(data).toBe(false);
    });
  });
});

describe("door-side capture", () => {
  test("set_registrant_rider_profile refuses without the module", async () => {
    // A registration id that does not exist: with the module on the RPC gets
    // as far as looking for it, and with it off it must stop before that.
    const args = {
      p_registration_id: crypto.randomUUID(),
      p_riding_discipline: "ski",
      p_ski_experience_level: "beginner",
    };

    const on = await adminClient.rpc("set_registrant_rider_profile", args);
    expect(on.error?.message).toBe("REGISTRANT_NOT_FOUND");

    await off(async () => {
      const { error } = await adminClient.rpc(
        "set_registrant_rider_profile",
        args,
      );
      expect(error?.message).toMatch(/not authorized/i);
    });
  });
});

describe("the mountain list", () => {
  test("an administrator replaces it, in order, and the public step reads it", async () => {
    const { error } = await adminClient.rpc("set_rider_profile_mountains", {
      p_mountains: ["  Whistler ", "Mount Hood"],
    });
    expect(error).toBeNull();

    const portal = await adminClient.rpc("rider_profile_mountains");
    expect(portal.data).toEqual(["Whistler", "Mount Hood"]);

    const { data } = await anonClient()
      .from("public_rider_profile_settings")
      .select("mountains");
    expect(data).toEqual([{ mountains: ["Whistler", "Mount Hood"] }]);
  });

  test("refuses Other, a blank name, and a name twice", async () => {
    for (const [mountains, code] of [
      [["Whistler", "other"], "MOUNTAIN_NAME_RESERVED"],
      [["Whistler", " "], "MOUNTAIN_NAME_REQUIRED"],
      [["Whistler", "WHISTLER"], "MOUNTAIN_NAME_DUPLICATE"],
    ] as const) {
      const { error } = await adminClient.rpc("set_rider_profile_mountains", {
        p_mountains: [...mountains],
      });
      expect(error?.message).toBe(code);
    }
  });

  test("is refused, and read as nothing, without the module", async () => {
    await off(async () => {
      const write = await adminClient.rpc("set_rider_profile_mountains", {
        p_mountains: ["Whistler"],
      });
      expect(write.error?.message).toBe("PERMISSION_DENIED");

      const portal = await adminClient.rpc("rider_profile_mountains");
      expect(portal.data).toBeNull();

      // No row at all: the public page learns "not offered" and "which
      // mountains" from one read.
      const { data, error } = await anonClient()
        .from("public_rider_profile_settings")
        .select("mountains");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });
  });
});
