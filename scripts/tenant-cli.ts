// Platform operator commands for tenants (#707 Phase 4). Every one runs as
// service_role against the project named by the environment, so point the
// environment at the right project before running anything here:
//
//   bun --env-file=.env.local scripts/tenant-cli.ts <command> ...      (local)
//   bun --env-file=.env.production.local scripts/tenant-cli.ts ...     (linked)
//
// or through the package.json aliases, which read .env.local:
//
//   bun run tenant:provision --name "Example Nonprofit" --slug example \
//       --domain example.org --admin person@example.org [--plan white_label]
//   bun run tenant:list
//   bun run tenant:export <slug> [--out path.json]
//   bun run tenant:plan <slug> --plan <internal|demo|white_label>
//   bun run tenant:archive <slug>
//   bun run tenant:delete <slug> --confirm <slug>
//   bun run tenant:support <slug> --email staff@platform.org --reason "..." \
//       [--days 7] [--role admin]
//
// Provisioning prints the first admin's invite link; nothing is emailed. The
// link is a convenience, not part of the provisioning: the admin's role is
// staged inside provision_tenant() and an existing account claims it on its
// next portal navigation. So nothing after the tenant is created fails the
// command -- with no --domain and no NEXT_PUBLIC_SITE_URL there is simply no
// link, and provision still exits 0 (#805).
//
// Deletion needs the tenant archived first (`tenant:archive`) and the slug
// typed a second time -- the database refuses an active tenant regardless,
// so the second check is for the operator, not the schema.
//
// `tenant:plan` is the only way to change an existing tenant's plan: the
// column is written nowhere else but provision_tenant()'s insert, and the
// portal's Platform page offers domain, status and export but deliberately not
// this. It refuses to move the last active internal tenant off `internal` --
// platform administration resolves only inside one, so there would be no way
// back in. See scripts/tenant/plan-guards.ts and #795.
//
// Support grants are normally issued by the tenant's own admin from
// Administration > Users; this command is the fallback for an organization
// that has locked itself out, and it should be used with their agreement.
// See docs/tenants.md.

import fs from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { inviteOrigin } from "./tenant/invite-origin";
import { TenantPlanError, assertPlanChange } from "./tenant/plan-guards";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  fail(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set (pass --env-file).",
  );
}

const service = createClient(url!, secret!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const [command, ...rest] = process.argv.slice(2);
const { values, positionals } = parseArgs({
  args: rest,
  allowPositionals: true,
  options: {
    name: { type: "string" },
    slug: { type: "string" },
    domain: { type: "string" },
    admin: { type: "string" },
    // No default: `plan` needs to tell "not given" from "white_label", since
    // omitting the flag there must fail rather than quietly demote a tenant.
    // `provision` applies the default itself.
    plan: { type: "string" },
    template: { type: "string" },
    out: { type: "string" },
    confirm: { type: "string" },
    email: { type: "string" },
    reason: { type: "string" },
    days: { type: "string", default: "7" },
    role: { type: "string", default: "admin" },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function required(value: string | undefined, flag: string): string {
  if (!value) fail(`--${flag} is required`);
  return value;
}

async function tenantBySlug(slug: string) {
  const { data, error } = await service
    .from("tenants")
    .select("id, name, slug, custom_domain, status, plan")
    .eq("slug", slug)
    .maybeSingle();
  if (error) fail(error.message);
  if (!data) fail(`No tenant with slug "${slug}"`);
  return data;
}

async function inviteLink(
  email: string,
  origin: string,
): Promise<string | null> {
  const redirectTo = `${origin}/auth/confirm`;
  let result = await service.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });
  let linkType: "invite" | "magiclink" = "invite";
  if (result.error?.code === "email_exists") {
    result = await service.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    linkType = "magiclink";
  }
  // Never fatal: by the time this runs the tenant is already committed, so a
  // GoTrue hiccup here must not report the provisioning as having failed.
  if (result.error || !result.data) {
    console.error(
      `Could not generate an invite link: ${result.error?.message}`,
    );
    return null;
  }
  return (
    `${origin}/auth/confirm?token_hash=${result.data.properties.hashed_token}` +
    `&type=${linkType}&next=/portal/set-password`
  );
}

async function provision() {
  const name = required(values.name, "name");
  const slug = required(values.slug, "slug");
  const admin = required(values.admin, "admin");
  const domain = values.domain?.toLowerCase() ?? null;

  const { data, error } = await service.rpc("provision_tenant", {
    p_name: name,
    p_slug: slug,
    p_custom_domain: domain,
    p_plan: values.plan ?? "white_label",
    p_admin_email: admin,
    p_template_tenant_id: values.template ?? null,
  });
  if (error) fail(`Provisioning failed: ${error.message}`);

  console.log(`Provisioned "${name}" (${slug}) as tenant ${data}.`);

  // Everything below is a convenience on top of a tenant that already exists.
  // The admin's role is staged as a pending_role_grants row inside
  // provision_tenant(), and an address that already has an account claims it on
  // its next portal navigation, link or no link -- so nothing here may exit
  // non-zero and report the provisioning as failed (#805).
  const origin = inviteOrigin(domain, process.env.NEXT_PUBLIC_SITE_URL);
  const link = origin ? await inviteLink(admin, origin) : null;
  if (link) {
    console.log(
      `\nFirst admin: ${admin}\nInvite link (expires in about an hour, nothing was emailed):\n${link}\n`,
    );
  } else {
    console.log(
      `\nFirst admin: ${admin} -- staged, but no invite link was minted.` +
        (origin
          ? ""
          : "\nThere was no origin to build one on: pass --domain, or set NEXT_PUBLIC_SITE_URL in the env file.") +
        `\nAn address that already has an account does not need one; it picks the role up on its next portal navigation.\n`,
    );
  }
  if (domain) {
    console.log(
      `Next: add ${domain} (and portal.${domain}) to the Vercel project and to the Supabase Auth redirect allowlist. See docs/tenants.md.`,
    );
  }
}

async function list() {
  const { data, error } = await service
    .from("tenants")
    .select("slug, name, status, plan, custom_domain, created_at")
    .order("created_at");
  if (error) fail(error.message);
  console.table(data);
}

async function exportTenant() {
  const slug = required(positionals[0], "slug (positional)");
  const tenant = await tenantBySlug(slug);
  const { data, error } = await service.rpc("export_tenant_data", {
    p_tenant_id: tenant.id,
  });
  if (error) fail(`Export failed: ${error.message}`);
  const out =
    values.out ??
    `${slug}-export-${new Date().toISOString().slice(0, 10)}.json`;
  fs.writeFileSync(out, JSON.stringify(data, null, 2));
  const tables = Object.keys(data.tables ?? {}).length;
  console.log(`Wrote ${out} (${tables} tables). It contains personal data.`);
}

async function archive() {
  const slug = required(positionals[0], "slug (positional)");
  const tenant = await tenantBySlug(slug);
  const { error } = await service
    .from("tenants")
    .update({ status: "archived" })
    .eq("id", tenant.id);
  if (error) fail(error.message);
  console.log(
    `Archived "${tenant.name}". Its sites no longer resolve and its members no longer see it. \`tenant:delete ${slug} --confirm ${slug}\` removes its data.`,
  );
}

async function changePlan() {
  const slug = required(positionals[0], "slug (positional)");
  const requestedPlan = required(values.plan, "plan");
  const tenant = await tenantBySlug(slug);

  // Other *active* internal tenants. An archived one is not serving the
  // Platform page, so it cannot be what stands between here and a lockout.
  const { count, error } = await service
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("plan", "internal")
    .eq("status", "active")
    .neq("id", tenant.id);
  if (error) fail(error.message);

  let plan;
  try {
    plan = assertPlanChange({
      tenant,
      requestedPlan,
      otherActiveInternalTenants: count ?? 0,
    });
  } catch (guardError) {
    if (guardError instanceof TenantPlanError) fail(guardError.message);
    throw guardError;
  }

  const { error: updateError } = await service
    .from("tenants")
    .update({ plan })
    .eq("id", tenant.id);
  if (updateError) fail(updateError.message);

  console.log(
    `"${tenant.name}" (${slug}) moved from ${tenant.plan} to ${plan}.`,
  );
  if (tenant.plan === "internal") {
    console.log(
      "Its admins no longer reach Administration > Platform; the internal tenant does.",
    );
  }
  if (plan === "internal") {
    console.log(
      "Its admins now reach Administration > Platform, and it is the provisioning template.",
    );
  }
}

async function remove() {
  const slug = required(positionals[0], "slug (positional)");
  if (values.confirm !== slug) {
    fail(`Deletion is permanent. Repeat the slug: --confirm ${slug}`);
  }
  const tenant = await tenantBySlug(slug);
  if (tenant.status !== "archived") {
    fail(`"${slug}" is ${tenant.status}; archive it first (tenant:archive).`);
  }
  const { data, error } = await service.rpc("delete_tenant", {
    p_tenant_id: tenant.id,
  });
  if (error) fail(`Deletion failed: ${error.message}`);
  const deleted = data.deleted as Record<string, number>;
  const rows = Object.values(deleted).reduce((sum, n) => sum + n, 0);
  console.log(
    `Deleted "${tenant.name}": ${rows} rows across ${Object.keys(deleted).length} tables in ${data.passes} passes. Accounts were not touched.`,
  );
}

async function support() {
  const slug = required(positionals[0], "slug (positional)");
  const email = required(values.email, "email").toLowerCase();
  const reason = required(values.reason, "reason");
  const days = Number(values.days);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    fail("--days must be a whole number from 1 to 90");
  }
  const tenant = await tenantBySlug(slug);

  const { data: users, error: usersError } = await service.auth.admin.listUsers(
    { perPage: 1000 },
  );
  if (usersError) fail(usersError.message);
  const user = users.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) fail(`No account has the email ${email}; they must sign in once.`);

  const { data: role, error: roleError } = await service
    .from("roles")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("name", values.role)
    .maybeSingle();
  if (roleError) fail(roleError.message);
  if (!role) fail(`"${tenant.name}" has no role named ${values.role}`);

  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  // Membership first so the role trigger's `on conflict do nothing` leaves
  // it a support row -- the same order grant_support_access() uses.
  const { error: membershipError } = await service
    .from("tenant_memberships")
    .upsert(
      {
        user_id: user.id,
        tenant_id: tenant.id,
        kind: "support",
        expires_at: expiresAt,
        reason,
      },
      { onConflict: "user_id,tenant_id" },
    );
  if (membershipError) fail(membershipError.message);
  const { error: roleAssignError } = await service
    .from("user_roles")
    .upsert(
      { user_id: user.id, role_id: role.id },
      { onConflict: "user_id,role_id" },
    );
  if (roleAssignError) fail(roleAssignError.message);

  console.log(
    `${email} holds ${values.role} in "${tenant.name}" as support until ${expiresAt}.`,
  );
}

const commands: Record<string, () => Promise<void>> = {
  provision,
  list,
  export: exportTenant,
  plan: changePlan,
  archive,
  delete: remove,
  support,
};

const run = command ? commands[command] : undefined;
if (!run) {
  fail(`Usage: tenant-cli.ts <${Object.keys(commands).join("|")}> ...`);
}
await run();
