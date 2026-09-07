import { StatusBadge, type StatusTone } from "@/components/portal/status-badge";
import { AlertTriangle, MessageSquareWarning } from "lucide-react";
import {
  CONTENT_STATUSES,
  type OverdueStage,
} from "./content-opportunity-shared";

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

const OVERDUE_STAGE_LABELS: Record<OverdueStage, string> = {
  draft: "Draft overdue",
  review: "Review overdue",
  publish: "Publish overdue",
};

const OVERDUE_STAGE_TITLES: Record<OverdueStage, string> = {
  draft: "The draft due date for this content opportunity has passed",
  review: "The review due date for this content opportunity has passed",
  publish: "The publish due date for this content opportunity has passed",
};

export function ContentOverdueFlag({ stage }: { stage: OverdueStage }) {
  return (
    <StatusBadge
      tone="danger"
      className="gap-1"
      title={OVERDUE_STAGE_TITLES[stage]}
    >
      <AlertTriangle className="size-3" />
      {OVERDUE_STAGE_LABELS[stage]}
    </StatusBadge>
  );
}

export function ChangesRequestedFlag() {
  return (
    <StatusBadge
      tone="danger"
      className="gap-1"
      title="The reviewer requested changes on this content opportunity"
    >
      <MessageSquareWarning className="size-3" />
      Changes requested
    </StatusBadge>
  );
}
