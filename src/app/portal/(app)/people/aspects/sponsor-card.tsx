import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/format";
import { HistoryCard, HistoryItem, HistoryList } from "./history-card";

type Sponsorship = {
  id: string;
  support_type: string;
  contribution_value: number | string | null;
  event: { name: string } | null;
};

function contributionSuffix(value: number | string | null) {
  const amount = formatCurrency(value, "");
  return amount ? ` · ${amount}` : "";
}

export async function SponsorCard({
  personId,
  actions,
}: {
  personId: string;
  actions?: ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("event_sponsors")
    .select("id, support_type, contribution_value, event:events(name)")
    .eq("person_id", personId);
  const sponsorships = (data ?? []) as unknown as Sponsorship[];

  return (
    <HistoryCard
      title="Sponsorships"
      count={sponsorships.length}
      emptyTitle="No sponsorships recorded"
      emptyDescription="Sponsorships appear here once this person is added on an event's Sponsors tab."
      actions={actions}
    >
      <HistoryList>
        {sponsorships.map((sponsorship) => (
          <HistoryItem
            key={sponsorship.id}
            primary={sponsorship.event?.name ?? "—"}
            secondary={
              <span className="capitalize">
                {sponsorship.support_type.replace("_", " ")}
                {contributionSuffix(sponsorship.contribution_value)}
              </span>
            }
          />
        ))}
      </HistoryList>
    </HistoryCard>
  );
}
