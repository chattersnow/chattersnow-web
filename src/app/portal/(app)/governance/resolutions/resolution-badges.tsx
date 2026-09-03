import {
  humanizeStatus,
  StatusBadge,
  type StatusTone,
} from "@/components/portal/status-badge";

const VOTE_OUTCOME_STYLES: Record<string, StatusTone> = {
  pending: "neutral",
  passed: "success",
  failed: "danger",
  tabled: "progress",
};

export function VoteOutcomeBadge({ outcome }: { outcome: string }) {
  return (
    <StatusBadge tone={VOTE_OUTCOME_STYLES[outcome] ?? "neutral"}>
      {humanizeStatus(outcome)}
    </StatusBadge>
  );
}
