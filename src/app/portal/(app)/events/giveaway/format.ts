/**
 * The one copy #1057 deliberately left behind, because it is the only one that
 * reads its day in UTC rather than in the browser's timezone -- and here that
 * is load-bearing rather than a bug. `giveaways.drawing_date` and
 * `giveaway_winners.distributed_at` are calendar days stored in a
 * `timestamptz` column as UTC midnight, so reading them back in UTC is what
 * makes the value round-trip. Swapping this for `utcIsoToDateInBrowser` on its
 * own would show every viewer west of Greenwich the previous day.
 *
 * #1053 is the real fix: move those two columns to `date`, at which point this
 * helper's callers bind the raw "YYYY-MM-DD" string end to end and this goes
 * away with it.
 */
export function toDateInputValue(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

export const DISTRIBUTION_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "distributed", label: "Distributed" },
  { value: "unclaimed", label: "Unclaimed" },
  { value: "other", label: "Other" },
];

export const DISTRIBUTION_STATUS_LABELS: Record<string, string> =
  Object.fromEntries(
    DISTRIBUTION_STATUSES.map((option) => [option.value, option.label]),
  );
