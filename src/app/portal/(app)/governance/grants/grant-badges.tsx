import { cn } from "@/lib/utils";
import { GRANT_STATUS_LABELS } from "./grant-form-fields";
import type { GrantStatus } from "./grant-form";

const STATUS_STYLES: Record<GrantStatus, string> = {
  planned: "bg-muted text-muted-foreground",
  submitted: "bg-[var(--purple-soft)] text-foreground",
  awarded: "bg-secondary text-secondary-foreground",
  declined: "bg-destructive/10 text-destructive",
};

export function GrantStatusBadge({ status }: { status: GrantStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {GRANT_STATUS_LABELS[status] ?? status}
    </span>
  );
}
