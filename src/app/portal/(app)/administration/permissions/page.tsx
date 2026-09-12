import { redirect } from "next/navigation";

/**
 * Permissions became a tab on Roles in #946.
 *
 * A route rather than a `next.config.ts` redirect, for the reason given in
 * administration/access-management/page.tsx: the portal is served both as
 * `/portal/...` paths and prefix-free on a `portal.` host.
 *
 * Deliberately not guarded, following administration/platform/page.tsx: it
 * renders nothing and reads nothing, and the Roles layout it hands the request
 * to refuses anyone without `administration:manage` anyway. Its own layout.tsx
 * is gone with the page it guarded.
 */
export default function PermissionsMovedPage() {
  redirect("/portal/administration/roles?tab=permissions");
}
