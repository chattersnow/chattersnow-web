import type { Metadata } from "next";
import { detailTitle } from "@/lib/portal/detail-title";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import type { MeetingRow } from "../meeting-badges";
import { MeetingDetailView } from "./meeting-detail-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}): Promise<Metadata> {
  const { meetingId } = await params;
  return {
    title: await detailTitle({
      table: "governance_meetings",
      column: "meeting_date",
      id: meetingId,
      fallback: "Meeting",
    }),
  };
}

// Meetings have no name; the detail view heads the page with the date, so
// the trail says the same thing. meeting_date is a timestamptz, so it is shown
// in the viewer's zone: pinned to UTC, an evening meeting read as the next day.
const meetingDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
});

function meetingDateLabel(meetingDate: string) {
  return meetingDateFormatter.format(new Date(meetingDate));
}

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "governance", "manage");

  const { data: meeting, error } = await supabase
    .from("governance_meetings")
    .select(
      "id, meeting_date, meeting_type, status, location, notes, minutes_approved_at, facilitator:people!facilitator_person_id(id, name, preferred_name, email, phone), notetaker:people!notetaker_person_id(id, name, preferred_name, email, phone)",
    )
    .eq("id", meetingId)
    .maybeSingle();

  if (error) {
    return (
      <Card>
        <CardContent className="app-muted text-sm">
          Could not load this meeting. Please try again.
        </CardContent>
      </Card>
    );
  }
  if (!meeting) notFound();

  return (
    <>
      <PortalBreadcrumbs
        current={meetingDateLabel(meeting.meeting_date as string)}
      />

      <MeetingDetailView
        meeting={meeting as unknown as MeetingRow}
        canManage={canManage}
      />
    </>
  );
}
