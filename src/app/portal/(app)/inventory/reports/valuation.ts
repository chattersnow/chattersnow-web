import { categoryLabelFor, UNCATEGORIZED_LABEL } from "@/lib/inventory";

export type ValuationItem = {
  type: string | null;
  category_key: string | null;
  category_label: string | null;
  category_group_label: string | null;
  status: string;
  face_value: number | string | null;
};

export type ValuationMovement = {
  movement_type: string;
  quantity: number;
  inventory_items: {
    face_value: number | string | null;
    donations: { people: { source_type: string | null } | null } | null;
  } | null;
};

// Which kind of donor an item's value came from. "unattributed" covers rows
// whose donation/donor did not come back: inventory_movements and
// inventory_items are readable with inventory_reports:view, but donations and
// people are gated on finance:view and people:view, so a custom role holding
// only the first would get null embeds. Bucketing those separately keeps the
// split honest instead of silently counting them as individual donations.
export type DonorBucket = "sponsor" | "individual" | "other" | "unattributed";

export type DonorBucketValuation = {
  bucket: DonorBucket;
  label: string;
  count: number;
  totalValue: number;
};

export const DONOR_BUCKETS: { value: DonorBucket; label: string }[] = [
  { value: "sponsor", label: "Sponsors & orgs" },
  { value: "individual", label: "Individuals" },
  { value: "other", label: "Other" },
  { value: "unattributed", label: "Unattributed" },
];

export type CategoryValuation = {
  /** Group label, or "Uncategorized" for items with no category. */
  group: string;
  category: string;
  count: number;
  totalValue: number;
};
export type StatusValuation = {
  status: string;
  count: number;
  totalValue: number;
};

export function toNumber(value: number | string | null): number {
  if (value === null || value === undefined) return 0;
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * On-hand value per category (issue #667).
 *
 * This used to group by the raw trimmed `type` string, so "Snowboard",
 * "snowboard" and "snow board" were three rows of the same category -- the
 * complaint that reports "can't roll up by category". Grouping is now on the
 * vocabulary, and `categoryLabelFor` supplies the label so an "Other" item
 * reads as its detail and a still-uncategorized legacy row reads as whatever
 * was typed.
 */
export function summarizeByCategory(
  items: ValuationItem[],
  status = "available",
): CategoryValuation[] {
  const totals = new Map<string, CategoryValuation>();
  for (const item of items) {
    if (item.status !== status) continue;
    const category = categoryLabelFor(item);
    const group = item.category_group_label ?? UNCATEGORIZED_LABEL;
    const key = `${group}\u0000${category}`;
    const entry = totals.get(key) ?? {
      group,
      category,
      count: 0,
      totalValue: 0,
    };
    entry.count += 1;
    entry.totalValue += toNumber(item.face_value);
    totals.set(key, entry);
  }
  return [...totals.values()].sort((a, b) => b.totalValue - a.totalValue);
}

/** The same totals rolled up one level, which is what the report leads with. */
export function summarizeByCategoryGroup(
  items: ValuationItem[],
  status = "available",
): { group: string; count: number; totalValue: number }[] {
  const totals = new Map<
    string,
    { group: string; count: number; totalValue: number }
  >();
  for (const row of summarizeByCategory(items, status)) {
    const entry = totals.get(row.group) ?? {
      group: row.group,
      count: 0,
      totalValue: 0,
    };
    entry.count += row.count;
    entry.totalValue += row.totalValue;
    totals.set(row.group, entry);
  }
  return [...totals.values()].sort((a, b) => b.totalValue - a.totalValue);
}

export function summarizeByStatus(
  items: ValuationItem[],
  statuses: string[],
): StatusValuation[] {
  const totals = new Map<string, StatusValuation>(
    statuses.map((status) => [status, { status, count: 0, totalValue: 0 }]),
  );
  for (const item of items) {
    const entry = totals.get(item.status) ?? {
      status: item.status,
      count: 0,
      totalValue: 0,
    };
    entry.count += 1;
    entry.totalValue += toNumber(item.face_value);
    totals.set(item.status, entry);
  }
  return statuses.map((status) => totals.get(status)!);
}

export function sumMovementValue(
  movements: ValuationMovement[],
  movementType: string,
): number {
  return movements
    .filter((movement) => movement.movement_type === movementType)
    .reduce(
      (total, movement) =>
        total +
        toNumber(movement.inventory_items?.face_value ?? null) *
          movement.quantity,
      0,
    );
}

export function donorBucketFor(
  sourceType: string | null | undefined,
): DonorBucket {
  switch (sourceType) {
    case "brand":
    case "organization":
      return "sponsor";
    case "individual":
      return "individual";
    case "event":
    case "other":
      return "other";
    default:
      return "unattributed";
  }
}

// Splits the same "received" value sumMovementValue reports into donor
// buckets, so the card total and this breakdown agree by construction. Count
// accumulates quantity rather than rows to stay consistent with the value,
// which is already face_value * quantity.
export function summarizeReceivedByDonorBucket(
  movements: ValuationMovement[],
): DonorBucketValuation[] {
  const totals = new Map<DonorBucket, DonorBucketValuation>(
    DONOR_BUCKETS.map(({ value, label }) => [
      value,
      { bucket: value, label, count: 0, totalValue: 0 },
    ]),
  );
  for (const movement of movements) {
    if (movement.movement_type !== "received") continue;
    const item = movement.inventory_items;
    const bucket = donorBucketFor(item?.donations?.people?.source_type);
    const entry = totals.get(bucket)!;
    entry.count += movement.quantity;
    entry.totalValue += toNumber(item?.face_value ?? null) * movement.quantity;
  }
  return DONOR_BUCKETS.map(({ value }) => totals.get(value)!);
}
