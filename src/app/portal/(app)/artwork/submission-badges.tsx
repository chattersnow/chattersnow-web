import {
  humanizeStatus,
  StatusBadge,
  type StatusTone,
} from "@/components/portal/status-badge";
import type { ArtworkSubmissionStatus } from "./submission-types";

const STATUS_STYLES: Record<ArtworkSubmissionStatus, StatusTone> = {
  pending: "progress",
  approved: "success",
  rejected: "danger",
};

export function ArtworkSubmissionStatusBadge({
  status,
}: {
  status: ArtworkSubmissionStatus;
}) {
  return (
    <StatusBadge tone={STATUS_STYLES[status] ?? "neutral"}>
      {humanizeStatus(status)}
    </StatusBadge>
  );
}

export function ArtworkCallStatusBadge({ isOpen }: { isOpen: boolean }) {
  return (
    <StatusBadge tone={isOpen ? "success" : "neutral"}>
      {isOpen ? "Open" : "Closed"}
    </StatusBadge>
  );
}
