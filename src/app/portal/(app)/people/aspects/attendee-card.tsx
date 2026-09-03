import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatInstantDate } from "@/lib/format";
import { HistoryCard, HistoryItem, HistoryList } from "./history-card";

type Registration = {
  id: string;
  party_size: number;
  created_at: string;
  checked_in_at: string | null;
  event: { name: string } | null;
};

export async function AttendeeCard({
  personId,
  actions,
}: {
  personId: string;
  actions?: ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("event_registrations")
    .select("id, party_size, created_at, checked_in_at, event:events(name)")
    .eq("person_id", personId)
    .order("created_at", { ascending: false });
  const registrations = (data ?? []) as unknown as Registration[];
  const attended = registrations.filter(
    (registration) => registration.checked_in_at !== null,
  ).length;

  return (
    <HistoryCard
      title="Event registrations"
      count={registrations.length}
      // Signing up and turning up are different things, so the attended count
      // sits alongside the total rather than replacing it.
      titleSuffix={<> · Attended {attended}</>}
      emptyTitle="No event registrations"
      emptyDescription="Registrations appear here once this person signs up for an event on the public site."
      actions={actions}
    >
      <HistoryList>
        {registrations.map((registration) => (
          <HistoryItem
            key={registration.id}
            primary={
              <>
                {registration.event?.name ?? "—"}
                {registration.checked_in_at && (
                  <span className="app-muted font-normal"> · Attended</span>
                )}
              </>
            }
            secondary={`Party of ${registration.party_size} · ${formatInstantDate(
              registration.created_at,
            )}`}
          />
        ))}
      </HistoryList>
    </HistoryCard>
  );
}
