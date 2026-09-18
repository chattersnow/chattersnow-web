import type { SupabaseClient } from "@supabase/supabase-js";
import { TIMEZONE_OPTIONS } from "@/lib/time";

/**
 * The organization's own time zone: where its reporting days begin and end
 * (#1065).
 *
 * This is the one question it answers. It does not say how a typed time is
 * read -- that is the browser's zone -- and it does not govern display, which
 * is the viewer's zone in the portal and the event's own on the public site
 * (docs/technical-spec.md 6.1). A report is the exception because a period has
 * to be cut somewhere, and cutting it at UTC midnight means a 7pm sale on the
 * last day of February counts in March.
 *
 * `get_finance_report_data` reads the setting itself in SQL. This module exists so the pages that choose a
 * *default range* -- fiscal-year-to-date, this month -- cut it on the same
 * boundary the RPC will bucket on; anchoring them on the server's UTC clock
 * instead is how the dashboard's month tile used to roll over at 6pm.
 *
 * Mirrors `sales-tax.ts` and `fiscal-year.ts`: a setting key, a fallback, and
 * one plain read per render.
 */

export const ORG_TIMEZONE_SETTING_KEY = "org.timezone";

/**
 * Applied when the setting can't be read, and what the migration gives a
 * tenant it could infer nothing for. UTC is what every report assumed before
 * #1065, so a failed read lands on the old behaviour rather than on some
 * third answer nobody would recognise.
 */
export const DEFAULT_ORG_TIME_ZONE = "UTC";

/**
 * Whether a stored value is one of the zones the portal offers. Deliberately
 * the same closed list the event and artwork-call forms validate against
 * (`TIMEZONE_OPTIONS`) rather than anything Postgres would accept: a zone
 * nobody can pick in the UI is a zone nobody can correct in the UI.
 */
export function isOrgTimeZone(value: unknown): value is string {
  return (
    typeof value === "string" &&
    TIMEZONE_OPTIONS.some((option) => option.value === value)
  );
}

/**
 * Reads the org's reporting time zone.
 *
 * Reads the `org_timezone` view rather than `app_settings` directly:
 * app_settings' select policy admits only six `manage` permissions, and
 * anyone who can open a report or a dashboard tile needs this value.
 */
export async function getOrgTimeZone(
  supabase: SupabaseClient,
): Promise<string> {
  const { data, error } = await supabase
    .from("org_timezone")
    .select("zone")
    .maybeSingle();

  // Falling back is right -- a report on the old boundary beats a report that
  // won't open -- but it must not be silent, for the reason fiscal-year.ts
  // gives: a swallowed PGRST205 once hid a missing view for weeks.
  if (error) {
    console.error(
      `[org-timezone] could not read org_timezone; falling back to ${DEFAULT_ORG_TIME_ZONE}`,
      error,
    );
  }

  const zone = data?.zone;
  return isOrgTimeZone(zone) ? zone : DEFAULT_ORG_TIME_ZONE;
}
