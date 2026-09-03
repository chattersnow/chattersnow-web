import {
  humanizeStatus,
  StatusBadge,
  type StatusTone,
} from "@/components/portal/status-badge";
import type { ExpenseStatus } from "./expenses-shared";

const STATUS_STYLES: Record<ExpenseStatus, StatusTone> = {
  submitted: "neutral",
  approved: "progress",
  rejected: "danger",
  paid: "success",
};

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  return (
    <StatusBadge tone={STATUS_STYLES[status] ?? "neutral"}>
      {humanizeStatus(status)}
    </StatusBadge>
  );
}
