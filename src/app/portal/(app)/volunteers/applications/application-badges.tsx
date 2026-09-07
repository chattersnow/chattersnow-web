import {
  humanizeStatus,
  StatusBadge,
  type StatusTone,
} from "@/components/portal/status-badge";
import type { VolunteerApplicationStatus } from "./application-types";

const STATUS_STYLES: Record<VolunteerApplicationStatus, StatusTone> = {
  new: "progress",
  "being reviewed": "progress",
  contacted: "neutral",
  placed: "success",
  declined: "danger",
  closed: "neutral",
};

export function VolunteerApplicationStatusBadge({
  status,
}: {
  status: VolunteerApplicationStatus;
}) {
  return (
    <StatusBadge tone={STATUS_STYLES[status] ?? "neutral"}>
      {humanizeStatus(status)}
    </StatusBadge>
  );
}
