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

  // "Assignments", not "Staff assignments" (#911): the four sibling cards are
  // titled for the records they hold -- Donations, Sponsorships, Event
  // registrations, Partnerships -- and none of them names the role. This one
  // did, which broke as soon as the word became the tenant's: the plural reads
  // "Instructors assignments" and the singular is often two words already
  // ("Staff Member assignments"). The aspect's own action group right below
  // still says "Instructor actions", so the role is named where it is grammar-
  // free to name it.
  return (
    <HistoryCard
      title="Assignments"
      count={assignments.length}
      emptyTitle="No assignments recorded"
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
