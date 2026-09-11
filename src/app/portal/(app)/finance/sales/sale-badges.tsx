import { StatusBadge, type StatusTone } from "@/components/portal/status-badge";
import type { SaleStatus } from "./sales-shared";

const STATUS_STYLES: Record<SaleStatus, StatusTone> = {
  completed: "success",
  // Not `destructive`: a void is an ordinary correction, not a failure, and a
  // ledger where a third of the rows shouted would be harder to read.
  voided: "neutral",
};

const STATUS_LABELS: Record<SaleStatus, string> = {
  completed: "Completed",
  voided: "Voided",
};

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return (
    <StatusBadge tone={STATUS_STYLES[status] ?? "neutral"}>
      {STATUS_LABELS[status] ?? status}
    </StatusBadge>
  );
}
