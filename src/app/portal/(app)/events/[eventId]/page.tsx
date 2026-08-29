import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { EventRow } from "../event-badges";
import { isTabValue } from "../event-tabs-config";
import { listEventLeadsAction } from "../actions";
import { listProgramsAction } from "../../programs/actions";
import { EventDetailView } from "./event-detail-view";

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
  const initialEditTab = isTabValue(tabParam) ? tabParam : undefined;

  const supabase = await createSupabaseServerClient();

  const { data: event, error } = await supabase
    .from("events")
    .select(
      "id, name, location, starts_at, ends_at, timezone, visibility, status, attendance_count, attendance_notes, description, event_type, venue, capacity, registration_enabled, registration_deadline, budget_amount, event_lead_id, report_status, report_summary, lessons_learned, feedback_notes, content_notes, report_submitted_at, report_submitted_by, program_id, flier_url",
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

  const [leadsResult, programsResult] = await Promise.all([
    listEventLeadsAction(),
    listProgramsAction(),
  ]);
  const eventLeads = "data" in leadsResult ? leadsResult.data : [];
  const programs = "data" in programsResult ? programsResult.data : [];

  return (
    <>
      <div className="rainbow-accent w-16" />
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        className="mb-2"
        render={<Link href="/portal/events" />}
      >
        <ArrowLeft /> Events
      </Button>

      <EventDetailView
        event={event}
        programs={programs}
        eventLeads={eventLeads}
        initialEditTab={initialEditTab}
      />
    </>
  );
}
