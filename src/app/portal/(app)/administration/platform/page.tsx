import { redirect } from "next/navigation";

/**
 * Platform moved to its own top-level section in #945.
 *
 * A route rather than a `next.config.ts` redirect, for the reason given in
 * administration/access-management/page.tsx: the portal is served both as
 * `/portal/...` paths and prefix-free on a `portal.` host.
 *
 * Deliberately not guarded. It renders nothing and reads nothing -- it hands
 * the request to /portal/platform, whose own layout refuses anyone without
 * `platform_tenants:manage`. Guarding here too would only decide which of two
 * identical denials an operator-less visitor sees.
 */
export default function PlatformMovedPage() {
  redirect("/portal/platform");
}
