// Rebuilds the public demo tenant from scratch (#604).
//
//   bun run demo:reset              # against whatever the environment points at
//   bun run demo:reset --local      # the local stack, with a warning
//   bun run demo:teardown           # remove the demo tenant and stop
//
// Everything goes through @supabase/supabase-js as service_role:
// provision_tenant, seed_demo_tenant, delete_tenant and the GoTrue admin API
// are all reachable that way, so there is no SQL execution channel here and no
// database password anywhere in this feature. The nightly job
// (.github/workflows/demo-reset.yml) runs exactly this.
//
// What a run does, in order:
//
//   1. create or update the demo auth account with the *fixed* DEMO_PASSWORD,
//      re-asserted every time. Nothing here can write a new password back into
//      Vercel's environment, so rotating it would only break the sign-in
//      button; re-asserting is also what undoes a visitor changing it at
//      /portal/set-password.
//   2. archive and delete_tenant() the existing demo tenant, after
//      assertDemoTenant() has agreed that is what it is.
//   3. provision_tenant(..., p_plan: 'demo', p_admin_email: null) and grant
//      the demo account the admin role directly. Passing null means no
//      pending_role_grants row is ever staged, so the claim-by-email hazard
//      this issue originally identified does not arise at all.
//   4. a people row and a user_onboarding row, so the first visitor lands on
//      the dashboard rather than the welcome tour.
//   5. seed_demo_tenant(), which refuses any tenant whose plan is not 'demo'.
//
// The demo tenant must never exist on the local stack by default: the
// integration and e2e suites depend on public_tenant_id()'s
// "the sole active tenant" fallback, and a second active tenant switches it
// off. Hence --local, and hence demo:teardown to undo it.

import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import {
  DemoGuardError,
  assertDemoTenant,
  requireEnv,
  type TenantRow,
} from "./demo/guards";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    local: { type: "boolean", default: false },
    teardown: { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let env: Record<string, string>;
try {
  env = requireEnv(process.env, [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "DEMO_EMAIL",
    "DEMO_PASSWORD",
    "DEMO_SLUG",
  ]);
} catch (error) {
  fail(
    `${(error as Error).message}\n` +
      "Pass --env-file, or set them in the workflow's environment.",
  );
}

const isLocal = /localhost|127\.0\.0\.1/.test(env.NEXT_PUBLIC_SUPABASE_URL);
// Tearing down is always safe, so it needs neither the flag nor the warning --
// only creating the tenant does.
if (isLocal && !values.local && !values.teardown) {
  fail(
    "That URL is the local stack. The demo tenant makes a local database " +
      "multi-tenant, which switches off the sole-active-tenant fallback the " +
      "integration and e2e suites rely on. Pass --local if you mean it, and " +
      "`bun run demo:teardown` when you are done.",
  );
}
if (values.local && !isLocal) {
  fail("--local was passed but the URL is not a local stack. Refusing.");
}
if (isLocal && !values.teardown) {
  console.warn(
    "\n!! Seeding a demo tenant on the LOCAL stack. `bun run test:integration` " +
      "and `bun run test:e2e` will fail until `bun run demo:teardown`.\n",
  );
}

const service = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function must<T>(
  result: PromiseLike<{ data: T; error: { message: string } | null }>,
  what: string,
): Promise<T> {
  const { data, error } = await result;
  if (error) fail(`${what}: ${error.message}`);
  return data;
}

async function findDemoTenant(): Promise<TenantRow | null> {
  const { data, error } = await service
    .from("tenants")
    .select("id, name, slug, plan, status")
    .eq("slug", env.DEMO_SLUG)
    .maybeSingle();
  if (error) fail(`Could not look up the demo tenant: ${error.message}`);
  return (data as TenantRow | null) ?? null;
}

/** The demo account, with DEMO_PASSWORD re-asserted. */
async function ensureDemoUser(): Promise<string> {
  const { data, error } = await service.auth.admin.listUsers({ perPage: 1000 });
  if (error) fail(`Could not list accounts: ${error.message}`);
  const existing = data.users.find(
    (user) => user.email?.toLowerCase() === env.DEMO_EMAIL.toLowerCase(),
  );

  if (existing) {
    const { error: updateError } = await service.auth.admin.updateUserById(
      existing.id,
      { password: env.DEMO_PASSWORD, email_confirm: true },
    );
    if (updateError) {
      fail(`Could not re-assert the demo password: ${updateError.message}`);
    }
    return existing.id;
  }

  const { data: created, error: createError } =
    await service.auth.admin.createUser({
      email: env.DEMO_EMAIL,
      password: env.DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Demo Visitor" },
    });
  if (createError || !created.user) {
    fail(`Could not create the demo account: ${createError?.message}`);
  }
  return created.user.id;
}

/** Archive and delete whatever demo tenant is there now. */
async function removeExistingTenant(): Promise<boolean> {
  const existing = await findDemoTenant();
  if (!existing) return false;

  try {
    assertDemoTenant(existing);
  } catch (error) {
    if (error instanceof DemoGuardError) fail(error.message);
    throw error;
  }

  // delete_tenant() refuses anything that is not archived, so this is both a
  // required step and a second place the wrong tenant would have to survive.
  await must(
    service
      .from("tenants")
      .update({ status: "archived" })
      .eq("id", existing.id)
      .select("id")
      .single(),
    "Archiving the old demo tenant",
  );
  const deleted = await must(
    service.rpc("delete_tenant", { p_tenant_id: existing.id }),
    "Deleting the old demo tenant",
  );
  const counts = ((deleted as { deleted?: Record<string, number> })?.deleted ??
    {}) as Record<string, number>;
  const rows = Object.values(counts).reduce((sum, n) => sum + n, 0);
  console.log(`Removed the previous demo tenant (${rows} rows).`);
  return true;
}

async function teardown() {
  const removed = await removeExistingTenant();
  console.log(
    removed
      ? "Demo tenant removed. The demo account itself was left alone."
      : "No demo tenant to remove.",
  );
}

async function reset() {
  const userId = await ensureDemoUser();
  await removeExistingTenant();

  const tenantId = (await must(
    service.rpc("provision_tenant", {
      p_name: process.env.DEMO_NAME?.trim() || "Demo Organization",
      p_slug: env.DEMO_SLUG,
      // Optional: the demo is reachable at its own host in production and by
      // the sole-tenant fallback nowhere else.
      p_custom_domain: process.env.DEMO_HOST?.trim() || null,
      p_plan: "demo",
      // Deliberately null: a staged grant for an address is claimable by
      // whoever registers it first, and the demo admin is granted directly
      // below instead.
      p_admin_email: null,
      p_template_tenant_id: null,
    }),
    "Provisioning the demo tenant",
  )) as string;

  const adminRole = await must(
    service
      .from("roles")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("name", "admin")
      .single(),
    "Finding the demo tenant's admin role",
  );

  // Membership first, so ensure_membership_for_role's `on conflict do
  // nothing` leaves it a plain member row rather than anything else -- the
  // same order grant_support_access() uses.
  await must(
    service
      .from("tenant_memberships")
      .upsert(
        { user_id: userId, tenant_id: tenantId, kind: "member" },
        { onConflict: "user_id,tenant_id" },
      )
      .select("id")
      .single(),
    "Joining the demo account to the demo tenant",
  );
  await must(
    service
      .from("user_roles")
      .upsert(
        { user_id: userId, role_id: (adminRole as { id: string }).id },
        { onConflict: "user_id,role_id" },
      )
      .select("user_id")
      .single(),
    "Granting the demo account admin",
  );
  // The switcher remembers a tenant per account, and the account's last
  // selection pointed at the tenant that has just been deleted.
  await must(
    service
      .from("user_tenant_selection")
      .upsert(
        { user_id: userId, tenant_id: tenantId },
        { onConflict: "user_id" },
      )
      .select("user_id")
      .single(),
    "Pointing the demo account at the new tenant",
  );

  const person = await must(
    service
      .from("people")
      .insert({
        tenant_id: tenantId,
        name: "Demo Visitor",
        source_type: "individual",
        person_type: "individual",
        email: env.DEMO_EMAIL,
        auth_user_id: userId,
        created_by: userId,
      })
      .select("id")
      .single(),
    "Creating the demo account's people row",
  );

  // So the first visitor lands on the dashboard instead of the welcome tour.
  await must(
    service
      .from("user_onboarding")
      .upsert(
        {
          user_id: userId,
          welcome_completed_at: new Date().toISOString(),
          last_release_seen: "9999.99.99",
        },
        { onConflict: "user_id" },
      )
      .select("user_id")
      .single(),
    "Marking the demo account's tour complete",
  );

  const seeded = await must(
    service.rpc("seed_demo_tenant", {
      p_tenant_id: tenantId,
      p_actor_user_id: userId,
      p_actor_person_id: (person as { id: string }).id,
    }),
    "Seeding the demo tenant",
  );

  console.log(
    `Demo tenant ${env.DEMO_SLUG} rebuilt: ${JSON.stringify(seeded)}`,
  );
  if (process.env.DEMO_HOST?.trim()) {
    console.log(
      `Reachable at https://${process.env.DEMO_HOST.trim()} once that host is on the Vercel project and the Supabase Auth redirect allowlist.`,
    );
  }
}

await (values.teardown ? teardown() : reset());
