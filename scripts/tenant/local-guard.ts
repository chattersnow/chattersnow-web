// The local-stack check that every command creating a tenant runs first
// (#906). One copy, shared by scripts/demo-reset.ts and scripts/tenant-cli.ts,
// free of any I/O so it can be unit tested (local-guard.test.ts).
//
// Why it exists: public_tenant_id() falls back to "the sole active tenant"
// only while exactly one tenant is active, and a fresh local database has
// exactly one. Creating a second active tenant on the local stack switches
// that fallback off, which takes the local public site down and fails
// `bun run test:integration` and `bun run test:e2e` until the tenant is gone
// again -- with no hint from the failure about why. The demo reset has refused
// a local URL without --local since #604; provisioning did not, and it is the
// command that needs no DEMO_* variables to run by accident.

export class LocalStackError extends Error {}

/** Whether a Supabase URL points at the local stack rather than a project. */
export function isLocalStack(url: string): boolean {
  return /localhost|127\.0\.0\.1/.test(url);
}

export type LocalGuardInput = {
  /** NEXT_PUBLIC_SUPABASE_URL as the command sees it. */
  url: string;
  /** Whether --local was passed. */
  local: boolean;
  /** What the command is about to create, e.g. "The demo tenant". */
  creates: string;
  /** The command(s) that remove it again, e.g. "`bun run demo:teardown`". */
  undo: string;
};

/**
 * Throws a LocalStackError when the command must not run: a local URL with no
 * --local, or --local against a URL that is not local. Otherwise returns the
 * warning to print before going ahead on the local stack, or null when the
 * target is a real project and there is nothing to warn about.
 */
export function guardLocalStack({
  url,
  local,
  creates,
  undo,
}: LocalGuardInput): string | null {
  const isLocal = isLocalStack(url);
  if (isLocal && !local) {
    throw new LocalStackError(
      `That URL is the local stack. ${creates} makes a local database ` +
        "multi-tenant, which switches off the sole-active-tenant fallback the " +
        "integration and e2e suites rely on. Pass --local if you mean it, and " +
        `${undo} when you are done.`,
    );
  }
  if (local && !isLocal) {
    throw new LocalStackError(
      "--local was passed but the URL is not a local stack. Refusing.",
    );
  }
  if (!isLocal) return null;
  return (
    `\n!! ${creates} is being created on the LOCAL stack. ` +
    "`bun run test:integration` and `bun run test:e2e` will fail until " +
    `${undo}.\n`
  );
}
