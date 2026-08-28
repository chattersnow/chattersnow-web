import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { WorkflowInfoCard } from "@/components/workflow-info-card";
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
        {canManage && <NewMeetingDialog />}
      </div>

      <div className="mt-6 space-y-4">
        <WorkflowInfoCard title="How meeting records work">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Scheduled</strong> — a meeting
              is created with a date, type, facilitator, and notetaker. Every
              meeting starts here.
            </li>
            <li>
              <strong className="text-foreground">During and after</strong> —
              opening a meeting&apos;s row shows seven tabs covering the whole
              record: Overview, Attendees, Agenda, Minutes, Action Items,
              Decisions, and Resolutions — all keyed to that same meeting.
            </li>
            <li>
              <strong className="text-foreground">
                Completed or cancelled
              </strong>{" "}
              — the meeting&apos;s status is updated once it&apos;s actually
              happened or been called off.
            </li>
          </ol>
          <p className="mt-3">
            Attendees, agenda items, decisions (with votes), action items (with
            owners), minutes, and resolutions are all logged from their own tab,
            independent of the meeting&apos;s overall status.
          </p>
        </WorkflowInfoCard>
        <MeetingsTable meetings={(meetings ?? []) as unknown as MeetingRow[]} />
      </div>
    </>
  );
}
