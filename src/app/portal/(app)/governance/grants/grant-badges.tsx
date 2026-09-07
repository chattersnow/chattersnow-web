import { StatusBadge, type StatusTone } from "@/components/portal/status-badge";
import { GRANT_STATUS_LABELS } from "./grant-form-fields";
import type { GrantStatus } from "./grant-form";

const STATUS_STYLES: Record<GrantStatus, StatusTone> = {
  planned: "neutral",
  submitted: "progress",
  awarded: "success",
  declined: "danger",
};

export function GrantStatusBadge({ status }: { status: GrantStatus }) {
  return (
    <StatusBadge tone={STATUS_STYLES[status] ?? "neutral"}>
      {GRANT_STATUS_LABELS[status] ?? status}
    </StatusBadge>
  );
}
