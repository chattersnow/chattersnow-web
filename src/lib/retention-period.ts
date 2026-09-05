/**
 * Renders a Postgres `interval` as the words a person would use.
 *
 * PostgREST hands back whatever Postgres's default interval output produces,
 * which abbreviates months: `interval '3 months'` comes back as `"3 mons"`, and
 * a single month as `"1 mon"`. Printed straight onto Administration > Data
 * Retention that reads as "Kept for 3 mons", which is a database artefact
 * showing through to somebody trying to answer "how long do we keep this?"
 * without opening the code -- the whole point of putting the period on the page.
 *
 * Handles the compound form (`"1 year 6 mons"`) too, because a board that
 * amends a period to eighteen months would otherwise hit exactly this again.
 */
const UNITS: Record<string, string> = {
  year: "year",
  years: "year",
  yr: "year",
  yrs: "year",
  mon: "month",
  mons: "month",
  month: "month",
  months: "month",
  day: "day",
  days: "day",
  week: "week",
  weeks: "week",
  hour: "hour",
  hours: "hour",
};

export function formatRetentionPeriod(period: string): string {
  const parts = [...period.matchAll(/(\d+)\s*([a-z]+)/gi)]
    .map(([, count, unit]) => {
      const singular = UNITS[unit.toLowerCase()];
      if (!singular) return null;
      const n = Number(count);
      return `${n} ${singular}${n === 1 ? "" : "s"}`;
    })
    .filter((part): part is string => part !== null);

  // An interval shape this doesn't recognise is shown as Postgres gave it,
  // rather than swallowed: a period rendering oddly is a much smaller problem
  // than a period silently rendering as nothing at all.
  if (parts.length === 0) return period;

  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
