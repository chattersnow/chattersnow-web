import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatCalendarDate } from "@/lib/format";
import { HistoryCard, HistoryItem, HistoryList } from "./history-card";

type Opportunity = {
  id: string;
  stage: string;
  next_step_date: string | null;
};

/**
 * The partner aspect: opportunities where this record *is* the partner
 * organization. Only a won opportunity makes someone a partner, but the card
 * lists every stage -- once they are a partner, the rest of their pipeline is
 * the history worth seeing, and hiding it would leave a won partner's earlier
 * or parallel conversations invisible.
 *
 * `owner_person_id` is deliberately not read here. Owning an opportunity is an
 * internal staff duty rather than partnership, so it stays on the standalone
 * card in [id]/partnerships-card.tsx.
 */
export async function PartnerCard({
  personId,
  actions,
}: {
  personId: string;
  actions?: ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("partnership_opportunities")
    .select("id, stage, next_step_date")
    .eq("organization_person_id", personId);
  const opportunities = (data ?? []) as unknown as Opportunity[];

  return (
    <HistoryCard
      title="Partnerships"
      count={opportunities.length}
      emptyTitle="No partnership opportunities recorded"
      emptyDescription="Opportunities appear here once this record is named as the partner organization from Governance › Partnerships."
      actions={actions}
    >
      <HistoryList>
        {opportunities.map((opportunity) => (
          <HistoryItem
            key={opportunity.id}
            primary={
              <span className="capitalize">
                {opportunity.stage.replace("_", " ")}
              </span>
            }
            secondary={
              opportunity.next_step_date
                ? `Next step ${formatCalendarDate(opportunity.next_step_date)}`
                : undefined
            }
          />
        ))}
      </HistoryList>
    </HistoryCard>
  );
}
