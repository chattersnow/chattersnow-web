import {
  humanizeStatus,
  StatusBadge,
  type StatusTone,
} from "@/components/portal/status-badge";
import type { ReimbursementStatus } from "./reimbursements-shared";

const STATUS_STYLES: Record<ReimbursementStatus, StatusTone> = {
  submitted: "neutral",
  approved: "progress",
  rejected: "danger",
  paid: "success",
};

export function ReimbursementStatusBadge({
  status,
}: {
  status: ReimbursementStatus;
}) {
  return (
    <StatusBadge tone={STATUS_STYLES[status] ?? "neutral"}>
      {humanizeStatus(status)}
    </StatusBadge>
  );
}
