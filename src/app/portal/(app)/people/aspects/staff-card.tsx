import type { ReactNode } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HistoryCard, HistoryItem, HistoryList } from "./history-card";

type StaffAssignment = {
  id: string;
  role: string | null;
  event: { name: string } | null;
};

export async function StaffCard({
  personId,
  actions,
}: {
  personId: string;
  actions?: ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("event_staff")
    .select("id, role, event:events(name)")
    .eq("person_id", personId);
  const assignments = (data ?? []) as unknown as StaffAssignment[];

  return (
    <HistoryCard
      title="Staff assignments"
      count={assignments.length}
      emptyTitle="No staff assignments recorded"
      emptyDescription="Assignments appear here once this person is added on an event's Staff tab."
      actions={actions}
    >
      <HistoryList>
        {assignments.map((assignment) => (
          <HistoryItem
            key={assignment.id}
            primary={assignment.event?.name ?? "—"}
            secondary={assignment.role ?? "No role recorded"}
          />
        ))}
      </HistoryList>
    </HistoryCard>
  );
}
