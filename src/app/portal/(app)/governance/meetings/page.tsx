import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { HowToSection, HowToSheet } from "@/components/how-to-sheet";
import { MeetingsTable } from "./meetings-table";
import { NewMeetingDialog } from "./new-meeting-dialog";
import type { MeetingRow } from "./meeting-badges";

export default async function MeetingsPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "governance", "manage");

  const { data: meetings } = await supabase
    .from("governance_meetings")
    .select(
      "id, meeting_date, meeting_type, status, location, notes, facilitator:people!facilitator_person_id(id, name, email, phone), notetaker:people!notetaker_person_id(id, name, email, phone)",
    )
    .order("meeting_date", { ascending: false });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Meetings
        </h1>
        <div className="flex items-center gap-2">
          <HowToSheet title="How meeting records work">
            <HowToSection heading="Steps">
              <ol className="list-decimal space-y-2 pl-4">
                <li>
                  <strong className="text-foreground">Scheduled</strong> — a
                  meeting is created with a date, type, facilitator, and
                  notetaker. Every meeting starts here.
                </li>
                <li>
                  <strong className="text-foreground">During and after</strong>{" "}
                  — opening a meeting&apos;s row shows seven tabs covering the
                  whole record: Overview, Attendees, Agenda, Minutes, Action
                  Items, Decisions, and Resolutions — all keyed to that same
                  meeting.
                </li>
                <li>
                  <strong className="text-foreground">
                    Completed or cancelled
                  </strong>{" "}
                  — the meeting&apos;s status is updated once it&apos;s actually
                  happened or been called off.
                </li>
              </ol>
            </HowToSection>
            <HowToSection heading="Who can do this">
              <p>
                <strong className="text-foreground">admin</strong> and{" "}
                <strong className="text-foreground">board</strong> manage
                meetings and their sub-records; no other role has access to
                Governance.
              </p>
            </HowToSection>
            <HowToSection heading="What happens downstream">
              <ul className="list-disc space-y-2 pl-4">
                <li>
                  Attendees, agenda items, decisions (with votes), action items
                  (with owners), minutes, and resolutions are all logged from
                  their own tab, independent of the meeting&apos;s overall
                  status.
                </li>
                <li>
                  Governance records aren&apos;t written to the audit log yet,
                  unlike expenses, users, and calendar items.
                </li>
              </ul>
            </HowToSection>
            <HowToSection heading="Common mistakes">
              <ul className="list-disc space-y-2 pl-4">
                <li>
                  Leaving a meeting&apos;s status as Scheduled after it happens
                  makes it look upcoming in board views.
                </li>
                <li>
                  Recording a vote as a Decision instead of a Resolution (or
                  vice versa) — decisions are lightweight per-meeting entries,
                  while resolutions carry motion text, a mover/seconder, and an
                  effective date for the formal record.
                </li>
              </ul>
            </HowToSection>
          </HowToSheet>
          {canManage && <NewMeetingDialog />}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <MeetingsTable meetings={(meetings ?? []) as unknown as MeetingRow[]} />
      </div>
    </>
  );
}
