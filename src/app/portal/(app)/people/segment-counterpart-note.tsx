import Link from "next/link";
import { hasAnyPermission, type PermissionMap } from "@/lib/auth/permissions";
import type { SegmentCounterpart } from "./people-segments";

/**
 * The reverse of the line on Administration → Users (#1198).
 *
 * Accounts is the only segment that carries one, and the pair is the treatment
 * `docs/portal-navigation.md` prescribes wherever one question is answered by
 * two screens: each surface names the other, and neither names a surface its
 * reader cannot open.
 */
export function SegmentCounterpartNote({
  counterpart,
  permissions,
}: {
  counterpart: SegmentCounterpart;
  permissions: PermissionMap;
}) {
  const { before, linkLabel, href, access } = counterpart.crossSurface;
  return (
    <p className="app-muted mt-2 max-w-2xl text-sm">
      {counterpart.scope}
      {hasAnyPermission(permissions, access) && (
        <>
          {" "}
          {before}{" "}
          <Link href={href} className="underline underline-offset-4">
            {linkLabel}
          </Link>
          .
        </>
      )}
    </p>
  );
}
