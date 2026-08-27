// Integration test: exercises the real has_permission()/my_permissions()
// RPCs (the data-driven authorization engine every RLS policy and route
// guard in the app calls through) against a real local Supabase stack and
// the actual role_permissions seed data -- not a mocked client. Nothing
// else in the test suite calls these RPCs against a live database, so a
// broken policy, a wrong resource key in a migration, or a regression in
// the deactivation/multi-role-union logic below would previously pass CI
// undetected. Requires `bun run db:start && bun run db:reset` first; run
// via `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SEEDED_USERS, signIn } from "../../../test/integration-setup";

async function permissionsFor(client: SupabaseClient) {
  const { data, error } = await client.rpc("my_permissions");
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const row of data as { resource_key: string; level: string }[]) {
    map[row.resource_key] = row.level;
  }
  return map;
}

describe("authorization matrix (integration)", () => {
  test("a signed-in user with no role has 'none' on every resource", async () => {
    const client = await signIn(SEEDED_USERS.noAccess);
    const permissions = await permissionsFor(client);
    expect(Object.keys(permissions).length).toBeGreaterThan(0);
    for (const level of Object.values(permissions)) {
      expect(level).toBe("none");
    }
  });

  test("a deactivated user has 'none' on every resource despite still holding a role", async () => {
    const client = await signIn(SEEDED_USERS.former);
    const permissions = await permissionsFor(client);
    expect(Object.keys(permissions).length).toBeGreaterThan(0);
    for (const level of Object.values(permissions)) {
      expect(level).toBe("none");
    }

    // has_permission() (used by RLS policies, not just my_permissions()) must
    // independently zero out the same account -- deactivation is enforced in
    // both functions and a regression could break just one of them.
    const { data: canManageEvents, error } = await client.rpc(
      "has_permission",
      { p_resource_key: "events", p_min_level: "view" },
    );
    expect(error).toBeNull();
    expect(canManageEvents).toBe(false);
  });

  test("admin has manage on administration (is_admin() boundary)", async () => {
    const client = await signIn(SEEDED_USERS.admin);
    const permissions = await permissionsFor(client);
    expect(permissions.administration).toBe("manage");
  });

  test("finance role can manage finance but not inventory or governance", async () => {
    const client = await signIn(SEEDED_USERS.finance);
    const permissions = await permissionsFor(client);
    expect(permissions.finance).toBe("manage");
    expect(permissions.finance_reports).toBe("view");
    expect(permissions.inventory).toBe("none");
    expect(permissions.governance).toBe("none");
    expect(permissions.administration).toBe("none");
  });

  test("board role can manage governance and view finance reports, but not finance detail or people", async () => {
    const client = await signIn(SEEDED_USERS.board);
    const permissions = await permissionsFor(client);
    expect(permissions.governance).toBe("manage");
    expect(permissions.finance_reports).toBe("view");
    expect(permissions.finance).toBe("none");
    expect(permissions.people).toBe("none");
    expect(permissions.events).toBe("none");
  });

  test("volunteer role has narrow workflow carve-outs, not full people/inventory access", async () => {
    const client = await signIn(SEEDED_USERS.volunteer);
    const permissions = await permissionsFor(client);
    expect(permissions.events).toBe("view");
    expect(permissions.people).toBe("none");
    expect(permissions.people_intake).toBe("manage");
    expect(permissions.inventory).toBe("none");
    expect(permissions.inventory_intake).toBe("manage");
    expect(permissions.volunteer_hours_logging).toBe("manage");
  });

  test("a user with multiple roles gets the highest level from either role, per resource", async () => {
    // multi@example.test holds event_coordinator (events: manage,
    // inventory_intake: none) and volunteer (events: view, inventory_intake:
    // manage) -- each resource should independently resolve to whichever
    // role grants more, proving this is a per-resource max, not "first role
    // wins" or "last role wins".
    const client = await signIn(SEEDED_USERS.multi);
    const permissions = await permissionsFor(client);
    expect(permissions.events).toBe("manage");
    expect(permissions.inventory_intake).toBe("manage");
    expect(permissions.volunteer_hours_logging).toBe("manage");
  });
});
