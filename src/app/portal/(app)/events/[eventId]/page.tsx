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
import { eventPhaseTaskLabels } from "../phase-status";
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

  const [
    programsResult,
    { data: deleteBlockers },
    { data: openChecklistItems },
    { data: impactNote },
  ] = await Promise.all([
    listProgramsAction(),
    // What, if anything, stops this event from being deleted -- so the delete
    // dialog can name it instead of only failing on submit. Only managers see
    // the affordance, so only they need the check.
    canManage
      ? supabase.rpc("event_delete_blockers", { p_id: eventId })
      : Promise.resolve({ data: null }),
    // The two phase-strip signals that don't live on the event row. Both are
    // small indexed lookups, and they let the strip count outstanding work
    // across a whole phase instead of checking three columns.
    supabase
      .from("event_checklist_items")
      .select("title")
      .eq("event_id", eventId)
      .eq("is_done", false),
    supabase
      .from("event_impact_notes")
      .select("event_id")
      .eq("event_id", eventId)
      .maybeSingle(),
  ]);

  const programs = "data" in programsResult ? programsResult.data : [];
  const phaseTasks = eventPhaseTaskLabels(event, {
    hasImpactNote: Boolean(impactNote),
    openChecklistTitles: (openChecklistItems ?? []).map((row) => row.title),
  });

  return (
    <>
      <PortalBreadcrumbs current={event.name} />

      <EventDetailView
        event={event}
        programs={programs}
        canManage={canManage}
        deleteBlockers={deleteBlockers ?? []}
        initialTab={initialTab}
        phaseTasks={phaseTasks}
      />
    </>
  );
}
