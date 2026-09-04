/*
 * The event type vocabulary.
 *
 * `events.event_type` is a plain nullable `text` column with no check
 * constraint (`20260822010000_add_event_workflow_fields.sql`), and rows
 * predating this list hold whatever was typed into the create dialog's
 * free-text field. The list below is therefore what the portal *offers*, not
 * what the database enforces: pickers must keep an unrecognised current value
 * selectable, and `eventTypeLabel` must render one rather than blanking it.
 */
export const EVENT_TYPES = [
  { value: "access_day", label: "Access day" },
  { value: "gear_swap", label: "Gear swap" },
  { value: "trail_cleanup", label: "Trail cleanup" },
  { value: "skills_clinic", label: "Skills clinic" },
  { value: "community_meetup", label: "Community meetup" },
  { value: "fundraiser", label: "Fundraiser" },
  { value: "holiday_drive", label: "Holiday drive" },
] as const;

/**
 * The stored value as a human label: a curated type by its label, anything
 * else humanised (`corporate_day` -> "Corporate day") so legacy free text and
 * slugs added outside this list still read properly on the public event pages.
 * Returns null for an absent type so callers keep their own fallback copy.
 */
export function eventTypeLabel(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const known = EVENT_TYPES.find((type) => type.value === trimmed);
  if (known) return known.label;

  const spaced = trimmed.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
