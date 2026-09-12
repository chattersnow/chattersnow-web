import { redirect } from "next/navigation";

/**
 * Access Management moved to its own top-level section in #943.
 *
 * Kept as a route rather than a `next.config.ts` redirect because the portal
 * is served two ways: `/portal/...` as a path on previews and locally, and
 * prefix-free on a `portal.` host, where `src/proxy.ts` rewrites `/x` to
 * `/portal/x`. A route resolves identically under both; a config redirect
 * matching on `/portal/...` would not.
 */
export default function AccessManagementMovedPage() {
  redirect("/portal/technology");
}
