// Integration test: exercises the real service-role client against a real
// local Supabase stack, confirming it can read/write ordinary tables per
// #221's grant migration (its only prior use was auth.admin.generateLink()
// in users/actions.ts, which doesn't depend on these grants at all). Guards
// against the grant silently regressing on a future schema reset. Requires
// `bun run db:start && bun run db:reset` first; run via
// `bun run test:integration`. Not picked up by `bun run test`.
import { describe, expect, mock, test } from "bun:test";

// admin.ts imports "server-only", which throws outside Next's bundler (it's
// aliased to a no-op only during a Next.js server build) -- stub it so this
// plain `bun test` run can import the real module under test.
mock.module("server-only", () => ({}));
const { createSupabaseAdminClient } = await import("./admin");

describe("createSupabaseAdminClient (integration)", () => {
  test("can select, insert, and delete on an ordinary table", async () => {
    const admin = createSupabaseAdminClient();

    // `events.created_by` has no session to default `auth.uid()` from under
    // the service-role key, so it must be supplied explicitly with a real
    // auth.users id -- reuse the seeded admin account for that.
    const { data: usersPage, error: listError } =
      await admin.auth.admin.listUsers();
    expect(listError).toBeNull();
    const seededUser = usersPage!.users.find(
      (user) => user.email === "admin@example.test",
    );
    if (!seededUser) throw new Error("seeded admin@example.test not found");

    const { data: inserted, error: insertError } = await admin
      .from("events")
      .insert({
        name: `service-role grant probe ${crypto.randomUUID()}`,
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        timezone: "America/Chicago",
        created_by: seededUser.id,
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();

    const { data: selected, error: selectError } = await admin
      .from("events")
      .select("id")
      .eq("id", inserted!.id)
      .single();
    expect(selectError).toBeNull();
    expect(selected?.id).toBe(inserted!.id);

    const { error: deleteError } = await admin
      .from("events")
      .delete()
      .eq("id", inserted!.id);
    expect(deleteError).toBeNull();
  });
});
