import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { HistoryCard, HistoryItem, HistoryList } from "./history-card";
import { ViewerTime } from "@/components/viewer-time";
import { attendedBeforeLabel } from "@/lib/attended-before";

type Registration = {
  id: string;
  party_size: number;
  created_at: string;
  checked_in_at: string | null;
  attended_before: boolean | null;
  cancelled_at: string | null;
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
    .select(
      "id, party_size, created_at, checked_in_at, attended_before, cancelled_at, event:events(name)",
    )
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
        {registrations.map((registration) => {
          const saidLabel = attendedBeforeLabel(registration.attended_before);
          return (
            <HistoryItem
              key={registration.id}
              primary={
                <>
                  {registration.event?.name ?? "—"}
                  {registration.checked_in_at && (
                    <span className="app-muted font-normal"> · Attended</span>
                  )}
                  {/* #1418. Kept in the history, and said so. */}
                  {registration.cancelled_at && (
                    <span className="app-muted font-normal"> · Cancelled</span>
                  )}
                </>
              }
              secondary={
                <>
                  {`Party of ${registration.party_size} · `}
                  <ViewerTime
                    iso={registration.created_at}
                    fallbackZone="UTC"
                    options={{ dateStyle: "medium" }}
                  />
                  {/* What they said about themselves when they signed up
                    (#1259), and only when they said something -- an
                    unanswered question is not a "no". Worded as a quotation
                    ("said") rather than as a fact, because the card above it
                    already states what the ledger knows: this is the one line
                    here that is the person's own account, which is exactly
                    what makes it useful to somebody reviewing a claim. */}
                  {saidLabel && (
                    <span className="app-muted">
                      {` · Said: ${saidLabel.toLowerCase()}`}
                    </span>
                  )}
                </>
              }
            />
          );
        })}
      </HistoryList>
    </HistoryCard>
  );
}
