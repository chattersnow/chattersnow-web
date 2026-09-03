import Link from "next/link";
import type { PermissionMap } from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { LinkPendingPulse } from "@/components/link-pending";
import { allowedActions, type PersonAspect } from "./types";

/**
 * The action row in a history card's footer. Renders nothing at all when the
 * viewer holds none of the owning modules, so the card shows no empty footer.
 */
export function AspectActions({
  aspect,
  permissions,
}: {
  aspect: Pick<PersonAspect, "label" | "actions">;
  permissions: PermissionMap;
}) {
  const actions = allowedActions(aspect, permissions);
  if (actions.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={`${aspect.label} actions`}
      className="flex flex-wrap gap-2"
    >
      {actions.map((action) => (
        <Button
          key={action.key}
          variant="secondary"
          size="sm"
          nativeButton={false}
          render={<Link href={action.href} />}
        >
          <LinkPendingPulse>{action.label}</LinkPendingPulse>
        </Button>
      ))}
    </div>
  );
}
