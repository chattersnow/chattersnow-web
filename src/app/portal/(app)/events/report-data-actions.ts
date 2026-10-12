"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  computeEventReport,
  type EventReport,
  type EventReportData,
  type EventReportSnapshotData,
} from "@/lib/portal/event-report-metrics";

export type EventReportView = {
  live: EventReport;
  /** The figures frozen when the report was submitted (#1579); null until then. */
  snapshot: { report: EventReport; capturedAt: string } | null;
};

function computeSections(result: Partial<EventReportData>): EventReport {
  return computeEventReport({
    money: result.money ?? null,
    goods: result.goods ?? null,
    sponsors: result.sponsors ?? null,
    team: result.team ?? null,
    operations: result.operations ?? null,
  });
}

/**
 * The Results card's Money, Goods, Sponsors, Team and Operations (#1576), live
 * and, once the report is submitted, as they stood then (#1579).
 *
 * Goes through the get_event_report_data RPC rather than the tables because
 * the readers of a report do not all hold the source tables' RLS grants -- the
 * board role holds finance_reports:view and events:none. The RPC is security
 * definer, does its own permission checks and returns null for each section
 * the caller may not see, live and frozen alike, which computeEventReport
 * passes through as a hidden section rather than zeros.
 */
export async function getEventReportAction(
  eventId: string,
): Promise<{ data: EventReportView } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_event_report_data", {
    p_event_id: eventId,
  });

  if (error) {
    return { error: "Could not load the event report. Please try again." };
  }

  const result = (data ?? {}) as Partial<EventReportData> & {
    snapshot?: Partial<EventReportSnapshotData> | null;
  };
  const snapshot = result.snapshot;
  return {
    data: {
      live: computeSections(result),
      snapshot: snapshot
        ? {
            report: computeSections(snapshot),
            capturedAt: snapshot.captured_at ?? "",
          }
        : null,
    },
  };
}
