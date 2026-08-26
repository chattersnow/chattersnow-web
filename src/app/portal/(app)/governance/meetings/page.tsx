import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { MeetingsTable } from "./meetings-table";
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
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Meetings
      </h1>

      <div className="mt-6">
        <MeetingsTable
          meetings={(meetings ?? []) as unknown as MeetingRow[]}
          canManage={canManage}
        />
      </div>
    </>
  );
}
