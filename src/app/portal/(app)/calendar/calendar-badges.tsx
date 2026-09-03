import {
  humanizeStatus,
  StatusBadge,
  type StatusTone,
} from "@/components/portal/status-badge";
import { AlertTriangle, Clock, ShieldAlert } from "lucide-react";
import { CATEGORIES, DECISIONS, labelFor } from "./calendar-shared";

const CALENDAR_STATUS_STYLES: Record<string, StatusTone> = {
  idea: "neutral",
  active: "progress",
  complete: "success",
  archived: "neutral",
};

const VISIBILITY_STYLES: Record<string, StatusTone> = {
  public: "info",
  internal: "neutral",
  unlisted_draft: "progress",
};

const VISIBILITY_LABELS: Record<string, string> = {
  public: "Public",
  internal: "Internal",
  unlisted_draft: "Unlisted draft",
};

const PRIORITY_TIER_STYLES: Record<string, StatusTone> = {
  "1": "danger",
  "2": "progress",
  "3": "neutral",
};

const DECISION_STYLES: Record<string, StatusTone> = {
  plan: "progress",
  skip: "neutral",
  defer: "info",
};

export function CalendarStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge tone={CALENDAR_STATUS_STYLES[status] ?? "neutral"}>
      {humanizeStatus(status)}
    </StatusBadge>
  );
}

export function CalendarVisibilityBadge({
  visibility,
}: {
  visibility: string;
}) {
  return (
    <StatusBadge tone={VISIBILITY_STYLES[visibility] ?? "neutral"}>
      {VISIBILITY_LABELS[visibility] ?? visibility}
    </StatusBadge>
  );
}

export function PriorityTierBadge({ tier }: { tier: number }) {
  return (
    <StatusBadge tone={PRIORITY_TIER_STYLES[String(tier)] ?? "neutral"}>
      Tier {tier}
    </StatusBadge>
  );
}

export function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) {
    return <StatusBadge tone="neutral">No decision</StatusBadge>;
  }
  return (
    <StatusBadge tone={DECISION_STYLES[decision] ?? "neutral"}>
      {labelFor(DECISIONS, decision)}
    </StatusBadge>
  );
}

export function CategoryBadges({ categories }: { categories: string[] }) {
  if (categories.length === 0)
    return <span className="app-muted text-sm">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {categories.map((category) => (
        <StatusBadge key={category} tone="neutral">
          {labelFor(CATEGORIES, category)}
        </StatusBadge>
      ))}
    </div>
  );
}

export function NeedsDecisionFlag() {
  return (
    <StatusBadge
      tone="danger"
      className="gap-1"
      title="Tier 1 moment with no plan, skip, or defer decision"
    >
      <AlertTriangle className="size-3" />
      Needs a decision
    </StatusBadge>
  );
}

export function SensitiveTopicBadge({ reviewed }: { reviewed: boolean }) {
  return (
    <StatusBadge tone={reviewed ? "info" : "danger"}>
      {reviewed ? "Sensitive topic — reviewed" : "Sensitive topic"}
    </StatusBadge>
  );
}

export function NeedsSensitiveReviewFlag() {
  return (
    <StatusBadge
      tone="danger"
      className="gap-1"
      title="This is a flagged sensitive-topic moment with no reviewer sign-off yet"
    >
      <ShieldAlert className="size-3" />
      Needs sensitive-topic review
    </StatusBadge>
  );
}

export function PastUndecidedFlag() {
  return (
    <StatusBadge
      tone="progress"
      className="gap-1"
      title="This moment has already passed with no plan, skip, or defer decision recorded"
    >
      <Clock className="size-3" />
      Past, undecided
    </StatusBadge>
  );
}
