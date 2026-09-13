import { cn } from "@/lib/utils";
import { gearRequestStatusLabel } from "@/lib/gear-requests";

/**
 * Where a request stands, at a glance. Same shape as the items list's
 * StatusBadge; the tones say "waiting on staff" (new), "waiting on the
 * requester" (quoted), "ready to go" (paid) and "done" (the rest).
 */
export function GearRequestStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        status === "new" && "bg-primary/10 text-primary",
        status === "quoted" &&
          "bg-amber-500/15 text-amber-800 dark:text-amber-300",
        status === "paid" &&
          "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
        (status === "fulfilled" || status === "cancelled") &&
          "bg-muted text-muted-foreground",
      )}
    >
      {gearRequestStatusLabel(status)}
    </span>
  );
}
