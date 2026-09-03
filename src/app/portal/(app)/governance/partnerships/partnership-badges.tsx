import { StatusBadge, type StatusTone } from "@/components/portal/status-badge";
import { PARTNERSHIP_STAGE_LABELS } from "./partnership-opportunity-form-fields";
import type { PartnershipStage } from "./partnership-opportunity-form";

const STAGE_STYLES: Record<PartnershipStage, StatusTone> = {
  prospecting: "neutral",
  contacted: "progress",
  proposal_sent: "progress",
  negotiating: "progress",
  closed_won: "success",
  closed_lost: "danger",
};

export function PartnershipStageBadge({ stage }: { stage: PartnershipStage }) {
  return (
    <StatusBadge tone={STAGE_STYLES[stage] ?? "neutral"}>
      {PARTNERSHIP_STAGE_LABELS[stage] ?? stage}
    </StatusBadge>
  );
}
