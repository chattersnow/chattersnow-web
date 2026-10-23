import { moduleEnabled } from "@/lib/portal/modules";

/** The tenant module that turns PostHog on for a public site (#1480). */
export const FORM_ANALYTICS_MODULE = "form_analytics";

/**
 * Where the browser sends PostHog's requests: our own host, rewritten to
 * PostHog's US ingest in `vercel.json` so domain-based ad blockers do not drop
 * them. Excluded from `src/proxy.ts`'s matcher, so no request here invokes the
 * proxy function.
 */
export const POSTHOG_PROXY_PATH = "/ph";

/**
 * Whether this public page loads PostHog, and with what (#1480). Null is off.
 *
 * All three must hold:
 *
 *   - **production only.** `NEXT_PUBLIC_VERCEL_ENV` is set by Vercel alone,
 *     so preview deploys, CI and local runs send nothing -- the lesson of
 *     `src/instrumentation-client.ts`, where CI sent Sentry 113k events in
 *     three days.
 *   - **a project key.** `NEXT_PUBLIC_POSTHOG_KEY`, set in Vercel Production.
 *   - **the tenant's module.** Off by default: a tenant's privacy policy has to
 *     name PostHog before its visitors are counted, and the platform default
 *     names it only where this module is on.
 *
 * Fails **closed** on the module, unlike `moduleEnabled()`'s usual fail-open:
 * an unreadable entitlement must not start tracking anybody.
 */
export function formAnalyticsConfig(
  modules: Record<string, boolean>,
  tenant: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): { apiKey: string; tenant: string } | null {
  if (env.NEXT_PUBLIC_VERCEL_ENV !== "production") return null;
  const apiKey = env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey || !tenant) return null;
  if (!(FORM_ANALYTICS_MODULE in modules)) return null;
  if (!moduleEnabled(modules, FORM_ANALYTICS_MODULE)) return null;
  return { apiKey, tenant };
}
