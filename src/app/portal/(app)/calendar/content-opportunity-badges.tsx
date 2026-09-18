import { StatusBadge, type StatusTone } from "@/components/portal/status-badge";
import { CONTENT_STATUSES } from "./content-opportunity-shared";

const CONTENT_STATUS_STYLES: Record<string, StatusTone> = {
  not_planned: "neutral",
  idea: "neutral",
  draft: "progress",
  in_review: "progress",
  changes_requested: "danger",
  approved: "success",
  scheduled: "success",
  published: "success",
  skipped: "neutral",
};

export function ContentStatusBadge({ status }: { status: string }) {
  const label =
    CONTENT_STATUSES.find((option) => option.value === status)?.label ?? status;
  return (
    <StatusBadge tone={CONTENT_STATUS_STYLES[status] ?? "neutral"}>
      {label}
    </StatusBadge>
  );
}
