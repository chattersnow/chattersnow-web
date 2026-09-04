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
import type { EventRow } from "../event-badges";
import { isTabValue } from "../event-tabs-config";
import { listProgramsAction } from "../../programs/actions";
import { EventDetailView } from "./event-detail-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>;
}): Promise<Metadata> {
  const { eventId } = await params;
  return {
    title: await detailTitle({
      table: "events",
      column: "name",
      id: eventId,
      fallback: "Event",
    }),
  };
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { eventId } = await params;
  const { tab } = await searchParams;
  const tabParam = Array.isArray(tab) ? tab[0] : tab;
  const initialTab = isTabValue(tabParam) ? tabParam : undefined;

  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "events", "manage");

  const { data: event, error } = await supabase
    .from("events")
    .select(
      "id, name, location, starts_at, ends_at, timezone, visibility, status, attendance_count, attendance_notes, description, event_type, venue, capacity, registration_enabled, registration_deadline, auto_assign_discount_codes, budget_amount, event_lead_id, event_lead:people!event_lead_id(id, name, preferred_name, email, phone), report_status, report_summary, lessons_learned, feedback_notes, content_notes, report_submitted_at, report_submitted_by, program_id, flier_url",
    )
    .eq("id", eventId)
    .maybeSingle<EventRow>();

  if (error) {
    return (
      <Card>
        <CardContent className="app-muted text-sm">
          Could not load this event. Please try again.
        </CardContent>
      </Card>
    );
  }
  if (!event) notFound();

  const programsResult = await listProgramsAction();
  const programs = "data" in programsResult ? programsResult.data : [];

  // What, if anything, stops this event from being deleted -- so the delete
  // dialog can name it instead of only failing on submit. Only managers see the
  // affordance, so only they need the check.
  const { data: deleteBlockers } = canManage
    ? await supabase.rpc("event_delete_blockers", { p_id: eventId })
    : { data: null };

  return (
    <>
      <PortalBreadcrumbs current={event.name} />

      <EventDetailView
        event={event}
        programs={programs}
        canManage={canManage}
        deleteBlockers={deleteBlockers ?? []}
        initialTab={initialTab}
      />
    </>
  );
}
