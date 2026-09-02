// Integration test for issue #421: audit_log.table_name is now FK-constrained
// against the `audited_tables` registry instead of a hand-retyped check
// constraint, and audit_log_row() resolves record_id via each table's
// registered pk_column instead of a hardcoded id/user_id coalesce. Exercises
// the two scenarios that previously shipped as production bugs --
// insert/update/delete on a plain `id`-keyed table (the common case every
// earlier check-constraint retype had to preserve) and on `deactivated_users`
// (`user_id`-keyed, per 20260826120000) -- plus the registry's own
// enforcement: an unregistered table_name is rejected by the FK, not
// silently accepted. Requires `bun run db:start && bun run db:reset` first;
// run via `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, mock, test } from "bun:test";
import {
  adminClient,
  uniqueEmail,
} from "../../../../../../test/integration-setup";

// admin.ts imports "server-only", which throws outside Next's bundler.
mock.module("server-only", () => ({}));
const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
const serviceRoleClient = createSupabaseAdminClient();

async function auditRows(table_name: string, record_id: string) {
  const { data, error } = await adminClient
    .from("audit_log")
    .select("action, record_id, old_data, new_data")
    .eq("table_name", table_name)
    .eq("record_id", record_id)
    .order("occurred_at", { ascending: true });
  if (error) throw error;
  return data;
}

describe("audit_log_row() via audited_tables registry", () => {
  test("logs insert/update/delete for a plain id-keyed table (app_settings)", async () => {
    const key = `it-audit-${crypto.randomUUID()}`;
    const { data: inserted, error: insertError } = await serviceRoleClient
      .from("app_settings")
      .insert({ key, value: { n: 1 } })
      .select("id")
      .single();
    expect(insertError).toBeNull();
    const id = inserted!.id as string;

    await serviceRoleClient
      .from("app_settings")
      .update({ value: { n: 2 } })
      .eq("id", id);
    await serviceRoleClient.from("app_settings").delete().eq("id", id);

    const rows = await auditRows("app_settings", id);
    expect(rows?.map((r) => r.action)).toEqual(["insert", "update", "delete"]);
    expect(rows?.[0].record_id).toBe(id);
    expect((rows?.[1].new_data as { value: { n: number } }).value.n).toBe(2);
    expect((rows?.[2].old_data as { value: { n: number } }).value.n).toBe(2);
  });

  test("resolves record_id via user_id for deactivated_users, not id", async () => {
    const { data: user, error: createError } =
      await serviceRoleClient.auth.admin.createUser({
        email: uniqueEmail("audit-deactivate"),
        password: "password123",
        email_confirm: true,
      });
    expect(createError).toBeNull();
    const userId = user!.user!.id;

    try {
      const { error: insertError } = await serviceRoleClient
        .from("deactivated_users")
        .insert({ user_id: userId });
      expect(insertError).toBeNull();

      await serviceRoleClient
        .from("deactivated_users")
        .delete()
        .eq("user_id", userId);

      const rows = await auditRows("deactivated_users", userId);
      expect(rows?.map((r) => r.action)).toEqual(["insert", "delete"]);
      expect((rows?.[0].new_data as { user_id: string }).user_id).toBe(userId);
      expect((rows?.[1].old_data as { user_id: string }).user_id).toBe(userId);
    } finally {
      await serviceRoleClient.auth.admin.deleteUser(userId);
    }
  });

  test("rejects an audit_log row for a table_name not in audited_tables", async () => {
    const { error } = await serviceRoleClient.from("audit_log").insert({
      table_name: "not_a_registered_table",
      record_id: crypto.randomUUID(),
      action: "insert",
      new_data: {},
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23503");
  });
});
