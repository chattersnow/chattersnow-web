import { cn } from "@/lib/utils";
import { PARTNERSHIP_STAGE_LABELS } from "./partnership-opportunity-form-fields";
import type { PartnershipStage } from "./partnership-opportunity-form";

const STAGE_STYLES: Record<PartnershipStage, string> = {
  prospecting: "bg-muted text-muted-foreground",
  contacted: "bg-[var(--purple-soft)] text-foreground",
  proposal_sent: "bg-[var(--purple-soft)] text-foreground",
  negotiating: "bg-[var(--purple-soft)] text-foreground",
  closed_won: "bg-secondary text-secondary-foreground",
  closed_lost: "bg-destructive/10 text-destructive",
};

export function PartnershipStageBadge({ stage }: { stage: PartnershipStage }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STAGE_STYLES[stage] ?? "bg-muted text-muted-foreground",
      )}
    >
      {PARTNERSHIP_STAGE_LABELS[stage] ?? stage}
    </span>
  );
}
