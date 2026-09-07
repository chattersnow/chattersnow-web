import {
  humanizeStatus,
  StatusBadge,
  type StatusTone,
} from "@/components/portal/status-badge";

export type ProgramRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
};

const STATUS_STYLES: Record<string, StatusTone> = {
  active: "info",
  pilot: "progress",
  retired: "neutral",
};

export function ProgramStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge tone={STATUS_STYLES[status] ?? "neutral"}>
      {humanizeStatus(status)}
    </StatusBadge>
  );
}
