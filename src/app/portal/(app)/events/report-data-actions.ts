"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  computeEventReport,
  type EventReport,
  type EventReportData,
} from "@/lib/portal/event-report-metrics";

/**
 * The Report card's computed sections (#1576).
 *
 * Goes through the get_event_report_data RPC rather than the tables because
 * the readers of a report do not all hold the source tables' RLS grants -- the
 * board role holds finance_reports:view and events:none. The RPC is security
 * definer, does its own permission checks and returns null for each section
 * the caller may not see, which computeEventReport passes through as a hidden
 * section rather than zeros.
 */
export async function getEventReportAction(
  eventId: string,
): Promise<{ data: EventReport } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_event_report_data", {
    p_event_id: eventId,
  });

  if (error) {
    return { error: "Could not load the event report. Please try again." };
  }

  const result = (data ?? {}) as Partial<EventReportData>;
  return {
    data: computeEventReport({
      money: result.money ?? null,
      goods: result.goods ?? null,
      sponsors: result.sponsors ?? null,
      team: result.team ?? null,
      operations: result.operations ?? null,
    }),
  };
}
