import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The org's fiscal year, which is not the calendar year. Chatter's year runs
 * July 1 - June 30 so that a winter season falls inside a single fiscal year
 * instead of being split across two annual reports (see
 * planning/decisions/2026-09-04-fiscal-year-definition.md). Every annual
 * figure in the portal -- the dashboard's "this year" totals, the Financial
 * Reports default range, the Annual Planning Review, the conflict-of-interest
 * disclosure year -- derives its boundary from here rather than from January 1.
 *
 * The boundary is a setting, not a constant: the bylaws put the fiscal year in
 * the Board's hands, so it has to be changeable without a deploy. It lives in
 * app_settings under FISCAL_YEAR_SETTING_KEY, edited at Administration >
 * System Settings > Organization.
 *
 * Everything here except `getFiscalYearStartMonth` is pure and takes the start
 * month as an argument, so the math is unit-testable without a database and a
 * page pays for exactly one settings read per render.
 *
 * This module has no runtime imports beyond a type, deliberately: the settings
 * panel is a client component that has to recompute the span preview as the
 * admin changes the dropdown, so it imports these helpers directly. Nothing
 * here may reach for `react`'s `cache` or `createSupabaseServerClient` -- both
 * would break that client bundle. (`page-visibility.ts` gets away with them
 * because its own panel only needs a type-only import.)
 */

export const FISCAL_YEAR_SETTING_KEY = "org.fiscal_year_start_month";

/**
 * Applied when the setting can't be read. Deliberately the same value the
 * migration seeds rather than 1 (a calendar year): if the read fails, every
 * report should stay on one consistent boundary instead of silently sliding to
 * a different period mid-session, which would be far harder to notice than an
 * outright error.
 */
export const DEFAULT_FISCAL_YEAR_START_MONTH = 7;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const FISCAL_YEAR_START_MONTH_OPTIONS = MONTH_NAMES.map(
  (label, index) => ({ value: index + 1, label }),
);

/** Whether a stored value is usable as a start month. */
export function isFiscalYearStartMonth(value: unknown): value is number {
  return (
    Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 12
  );
}

/**
 * Reads the org's fiscal year start month (1-12).
 *
 * Callers read this once per render and thread the number through the pure
 * helpers below, so there's no `cache()` wrapper -- same plain-read shape as
 * `getApprovalContext` in @/lib/finance/approval-workflow.
 *
 * Reads the `org_fiscal_year` view rather than `app_settings` directly:
 * app_settings' select policy only admits system_settings/event_expenses/
 * content_calendar managers, and the fiscal year is needed by anyone who can
 * see the dashboard. The view exposes this one key to `authenticated` without
 * handing out the approval thresholds alongside it.
 */
export async function getFiscalYearStartMonth(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase
    .from("org_fiscal_year")
    .select("start_month")
    .maybeSingle();

  // Falling back is right -- a report with a slightly wrong period beats a
  // page that won't render -- but it must not be silent. The page-visibility
  // view was missing from production for a while and the PGRST205 that came
  // back on every request was swallowed, so the admin toggles just looked like
  // they refused to save. Don't repeat that here.
  if (error) {
    console.error(
      `[fiscal-year] could not read org_fiscal_year; falling back to month ${DEFAULT_FISCAL_YEAR_START_MONTH}`,
      error,
    );
  }

  const startMonth = data?.start_month;
  return isFiscalYearStartMonth(startMonth)
    ? startMonth
    : DEFAULT_FISCAL_YEAR_START_MONTH;
}

/** "YYYY-MM-DD" for a UTC y/m/d triple, without going through local time. */
function toIsoDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

/**
 * The fiscal year a date falls in, named for the calendar year the fiscal year
 * ENDS in -- the US federal/GAAP convention, and how a 990 or an auditor will
 * refer to it. With a July start, August 2026 and March 2027 are both FY2027.
 *
 * A January start makes the fiscal year the calendar year, so this returns the
 * calendar year unchanged -- which is what keeps a January setting equivalent
 * to the behavior this replaced.
 */
export function fiscalYearForDate(date: Date, startMonth: number): number {
  const year = date.getUTCFullYear();
  // Month is 1-based here; on or after the start month, the year ends next
  // calendar year. A January start never advances, so FY == calendar year.
  return date.getUTCMonth() + 1 >= startMonth && startMonth > 1
    ? year + 1
    : year;
}

/**
 * The full "YYYY-MM-DD" span of a fiscal year, both bounds inclusive to match
 * get_finance_report_data. FY2027 with a July start is
 * 2026-07-01 - 2027-06-30; with a January start it is 2027-01-01 - 2027-12-31.
 */
export function fiscalYearRange(
  fiscalYear: number,
  startMonth: number,
): { from: string; to: string } {
  const startYear = startMonth > 1 ? fiscalYear - 1 : fiscalYear;
  const from = toIsoDate(startYear, startMonth, 1);
  // Day 0 of the start month, one year on, is the last day of the fiscal year
  // -- leap-year-correct without special-casing February.
  const to = new Date(Date.UTC(startYear + 1, startMonth - 1, 0))
    .toISOString()
    .slice(0, 10);
  return { from, to };
}

/**
 * Fiscal-year-to-date: the start of the fiscal year `now` falls in, through
 * `now` itself. Replaces the calendar `yearToDateRange` the Financial Reports
 * page and the dashboard used to open on. Both bounds come off the same UTC
 * instant so a run near midnight can't produce an inverted range.
 */
export function fiscalYearToDateRange(
  now: Date,
  startMonth: number,
): { from: string; to: string } {
  const { from } = fiscalYearRange(
    fiscalYearForDate(now, startMonth),
    startMonth,
  );
  return { from, to: now.toISOString().slice(0, 10) };
}

/** "FY2027". */
export function formatFiscalYearLabel(fiscalYear: number): string {
  return `FY${fiscalYear}`;
}

/** "July 1 - June 30", for explaining the setting in the admin UI. */
export function describeFiscalYearSpan(startMonth: number): string {
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const lastDay = new Date(Date.UTC(2001, endMonth, 0)).getUTCDate();
  return `${MONTH_NAMES[startMonth - 1]} 1 – ${MONTH_NAMES[endMonth - 1]} ${lastDay}`;
}

/**
 * Fiscal years for a report's year picker, newest first. Defaults match the
 * calendar-year picker this replaced on the Annual Planning Review (one year
 * ahead, four behind), since planning happens before the year starts.
 */
export function fiscalYearOptions(
  now: Date,
  startMonth: number,
  { back = 4, forward = 1 }: { back?: number; forward?: number } = {},
): number[] {
  const current = fiscalYearForDate(now, startMonth);
  const options: number[] = [];
  for (let offset = forward; offset >= -back; offset--) {
    options.push(current + offset);
  }
  return options;
}
