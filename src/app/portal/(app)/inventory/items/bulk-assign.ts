import { ITEM_EXIT_STATUSES, type InventoryItem } from "./inventory-shared";

/**
 * Assigning numbered codes to many items from the Items list (#1542): the
 * pure half of the dialog, so what is walked, what is passed over and what
 * the summary says can be tested without rendering it.
 */

export type BulkAssignItem = Pick<
  InventoryItem,
  "id" | "description" | "status" | "assetTag" | "numberedCode"
>;

export type BulkSkipReason =
  "has_numbered" | "left_inventory" | "code_taken" | "by_hand" | "not_reached";

export type BulkAssigned = { id: string; description: string; code: string };
export type BulkSkipped = {
  id: string;
  description: string;
  reason: BulkSkipReason;
  /** The code in question: the one the item already has, or the one taken. */
  code?: string | null;
  /** For a taken code, the item that has it. */
  holder?: string | null;
};

/**
 * Which selected items the dialog walks. An item that already has a numbered
 * code or has left inventory is passed over up front, with its reason, so
 * a selection made before filtering can't replace a code by accident.
 */
export function planBulkAssign(items: readonly BulkAssignItem[]): {
  queue: BulkAssignItem[];
  skipped: BulkSkipped[];
} {
  const queue: BulkAssignItem[] = [];
  const skipped: BulkSkipped[] = [];
  for (const item of items) {
    if (ITEM_EXIT_STATUSES.includes(item.status)) {
      skipped.push({ ...pick(item), reason: "left_inventory" });
    } else if (item.numberedCode) {
      skipped.push({
        ...pick(item),
        reason: "has_numbered",
        code: item.numberedCode,
      });
    } else {
      queue.push(item);
    }
  }
  return { queue, skipped };
}

function pick(item: BulkAssignItem) {
  return { id: item.id, description: item.description };
}

export function skipReasonText(skip: BulkSkipped): string {
  switch (skip.reason) {
    case "has_numbered":
      return `Already has ${skip.code}.`;
    case "left_inventory":
      return "Has left inventory.";
    case "code_taken":
      return skip.holder
        ? `${skip.code} is on ${skip.holder}.`
        : `${skip.code} is on another item.`;
    case "by_hand":
      return "Skipped.";
    case "not_reached":
      return "Not reached: stopped before it.";
  }
}

/**
 * The first suggested code not already used in this run, so the dialog
 * doesn't offer a code it has just bound.
 */
export function nextSuggestion(
  free: readonly string[],
  used: readonly string[],
): string | null {
  return free.find((code) => !used.includes(code)) ?? null;
}

/** "3 items", "1 item". */
export function itemCount(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}
