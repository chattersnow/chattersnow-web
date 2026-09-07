// The safety checks the demo reset (#604) runs before it destroys anything.
//
// Split out of scripts/demo-reset.ts and kept free of any I/O so they can be
// unit tested (guards.test.ts) -- "never delete a tenant that is not the
// demo" is the one rule in this feature whose failure is unrecoverable, and a
// rule that can only be exercised by running the real thing against a real
// project is not a rule anybody checks.
//
// The database enforces the same thing independently: seed_demo_tenant()
// refuses any tenant whose plan is not 'demo' in its first statement. These
// guards are what stop the script before it gets that far, and they also
// cover the step the database cannot -- delete_tenant() will happily remove
// whatever archived tenant it is handed.

/** Just enough of a `tenants` row to decide whether it is safe to destroy. */
export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
};

export class DemoGuardError extends Error {}

/**
 * Slugs that are never the demo, whatever the database says.
 *
 * `plan` is the real check -- it is a constrained enum and the same value the
 * database refuses to seed without. This list exists for the case where the
 * plan column is wrong: naming the initial tenant's slug (20260905190000)
 * means a demo reset pointed at the live project by a mistyped `DEMO_SLUG`
 * stops here rather than archiving Chatter Snow.
 */
export const PROTECTED_SLUGS = ["chatter-snow"];

/**
 * Throws unless this row is a tenant the reset may archive, delete and
 * rebuild. Returns the row so it can be used inline.
 */
export function assertDemoTenant(tenant: TenantRow | null): TenantRow {
  if (!tenant) {
    throw new DemoGuardError("No tenant with that slug exists.");
  }
  if (tenant.plan !== "demo") {
    throw new DemoGuardError(
      `Refusing to touch "${tenant.slug}": its plan is "${tenant.plan}", not "demo".`,
    );
  }
  if (PROTECTED_SLUGS.includes(tenant.slug)) {
    throw new DemoGuardError(
      `Refusing to touch "${tenant.slug}": that slug is never the demo, whatever its plan says.`,
    );
  }
  return tenant;
}

/** Throws unless every named variable is set to something non-blank. */
export function requireEnv(
  env: Record<string, string | undefined>,
  names: string[],
): Record<string, string> {
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new DemoGuardError(`Missing required env: ${missing.join(", ")}.`);
  }
  return Object.fromEntries(
    names.map((name) => [name, env[name]!.trim()]),
  ) as Record<string, string>;
}
