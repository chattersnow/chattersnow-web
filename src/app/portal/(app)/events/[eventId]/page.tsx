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
import { eventPhases, isTabValue, type TabValue } from "../event-tabs-config";
import { eventCardTaskLabels, isPhaseKey } from "../phase-status";
import { listProgramsAction } from "../../programs/actions";
import { EventDetailView } from "./event-detail-view";

/**
 * The row as PostgREST returns it: program links arrive as an embedded array
 * and are flattened to `EventRow["program_ids"]` below, the same normalisation
 * the calendar does for `calendar_item_programs`.
 */
type RawEventRow = Omit<EventRow, "program_ids"> & {
  event_programs: { program_id: string }[] | null;
};

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
  const query = await searchParams;
  const one = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "events", "manage");
  // Resolved here rather than in the client view, so a card whose section this
  // reader has no access to -- or whose module this tenant was never sold
  // (#903) -- is absent from the payload rather than hidden in it.
  const phases = eventPhases(permissions);

  // Which section the rail opens on, resolved here so a card this reader has
  // no access to is never the answer. `?tab=` is the parameter the rail keeps
  // and every deep link already writes; `?card=` and `?phase=` are #958's two
  // tab levels, read so a bookmark from before the rail still lands where it
  // meant to (#1008).
  const visible = phases.flatMap((phase) => phase.tabs);
  const named = (value: string | undefined): TabValue | undefined => {
    if (!value || !isTabValue(value)) return undefined;
    return visible.some((section) => section.value === value)
      ? value
      : undefined;
  };
  const legacyPhase = one(query.phase);
  const initialCard: TabValue =
    named(one(query.tab)) ??
    named(one(query.card)) ??
    (legacyPhase && isPhaseKey(legacyPhase)
      ? phases.find((phase) => phase.key === legacyPhase)?.tabs[0]?.value
      : undefined) ??
    visible[0]?.value ??
    "overview";

  const { data: eventRow, error } = await supabase
    .from("events")
    .select(
      "id, name, location, starts_at, ends_at, timezone, visibility, status, attendance_count, attendance_notes, description, capacity, registration_enabled, registration_deadline, auto_assign_discount_codes, budget_amount, event_lead_id, event_lead:people!events_event_lead_id_fkey(id, name, preferred_name, email, phone), report_status, report_summary, lessons_learned, feedback_notes, content_notes, report_submitted_at, report_submitted_by, flier_url, event_programs(program_id)",
    )
    .eq("id", eventId)
    .maybeSingle<RawEventRow>();

  if (error) {
    return (
      <Card>
        <CardContent className="app-muted text-sm">
          Could not load this event. Please try again.
        </CardContent>
      </Card>
    );
  }
  if (!eventRow) notFound();

  const { event_programs, ...rest } = eventRow;
  const event: EventRow = {
    ...rest,
    program_ids: (event_programs ?? []).map((link) => link.program_id),
  };

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
  const cardTasks = eventCardTaskLabels(event, {
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
        phases={phases}
        initialCard={initialCard}
        cardTasks={cardTasks}
      />
    </>
  );
}
