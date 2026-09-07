import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatInstantDate } from "@/lib/format";
import { HistoryCard, HistoryItem, HistoryList } from "./history-card";

type Donation = {
  id: string;
  donated_at: string;
  notes: string | null;
  event: { name: string } | null;
};

export async function DonorCard({
  personId,
  actions,
}: {
  personId: string;
  actions?: ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("donations")
    .select("id, donated_at, notes, event:events(name)")
    .eq("donor_id", personId)
    .order("donated_at", { ascending: false });
  const donations = (data ?? []) as unknown as Donation[];

  return (
    <HistoryCard
      title="Donations"
      count={donations.length}
      emptyTitle="No donations recorded"
      emptyDescription="Gear donations appear here once one is recorded for this person from Inventory › Donations."
      actions={actions}
    >
      <HistoryList>
        {donations.map((donation) => (
          <HistoryItem
            key={donation.id}
            primary={`${formatInstantDate(donation.donated_at)}${
              donation.event?.name ? ` · ${donation.event.name}` : ""
            }`}
            secondary={donation.notes}
          />
        ))}
      </HistoryList>
    </HistoryCard>
  );
}
