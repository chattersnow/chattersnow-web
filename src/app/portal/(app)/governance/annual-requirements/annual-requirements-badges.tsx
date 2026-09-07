import { StatusBadge, type StatusTone } from "@/components/portal/status-badge";
import type { RequirementStatus } from "./annual-requirement-form";

const REQUIREMENT_STATUS_STYLES: Record<RequirementStatus, StatusTone> = {
  not_started: "neutral",
  in_progress: "progress",
  done: "success",
};

const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
};

export function RequirementStatusBadge({
  status,
}: {
  status: RequirementStatus;
}) {
  return (
    <StatusBadge tone={REQUIREMENT_STATUS_STYLES[status]}>
      {REQUIREMENT_STATUS_LABELS[status]}
    </StatusBadge>
  );
}
