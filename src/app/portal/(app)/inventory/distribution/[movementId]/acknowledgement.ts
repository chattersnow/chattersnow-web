import type { ItemHistoryRow } from "../../items/[itemId]/item-history";

/**
 * A distribution's as-is acknowledgement, or why there is none (#1519), as
 * the item's history reports it. Read from `inventory_item_history` rather
 * than the acknowledgement row directly, because a handout that fulfilled a
 * gear request carries the request's acknowledgement instead of its own, and
 * the function already resolves that.
 */
export type DistributionAcknowledgement = {
  acknowledgedAt: string | null;
  typedName: string | null;
  method: string | null;
  skippedReason: string | null;
  skippedNote: string | null;
};

/** The acknowledgement on this movement's history row, or null when the
 *  history has nothing recorded for it (a distribution from before #1519). */
export function acknowledgementFromHistory(
  rows: ItemHistoryRow[] | null | undefined,
  movementId: string,
): DistributionAcknowledgement | null {
  const row = (rows ?? []).find(
    (entry) => entry.entry_kind === "movement" && entry.entry_id === movementId,
  );
  if (!row) return null;
  const acknowledgement = {
    acknowledgedAt: row.as_is_acknowledged_at ?? null,
    typedName: row.as_is_typed_name?.trim() || null,
    method: row.as_is_method ?? null,
    skippedReason: row.as_is_skipped_reason ?? null,
    skippedNote: row.as_is_skipped_note?.trim() || null,
  };
  return acknowledgement.acknowledgedAt || acknowledgement.skippedReason
    ? acknowledgement
    : null;
}
