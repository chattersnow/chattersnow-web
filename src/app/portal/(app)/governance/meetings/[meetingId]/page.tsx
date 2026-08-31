import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { MeetingRow } from "../meeting-badges";
import { MeetingDetailView } from "./meeting-detail-view";

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
      "id, meeting_date, meeting_type, status, location, notes, minutes_approved_at, facilitator:people!facilitator_person_id(id, name, email, phone), notetaker:people!notetaker_person_id(id, name, email, phone)",
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
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        className="mb-2"
        render={<Link href="/portal/governance/meetings" />}
      >
        <ArrowLeft /> Meetings
      </Button>

      <MeetingDetailView
        meeting={meeting as unknown as MeetingRow}
        canManage={canManage}
      />
    </>
  );
}
