export type ValuationItem = {
  type: string | null;
  status: string;
  face_value: number | string | null;
};

export type ValuationMovement = {
  movement_type: string;
  quantity: number;
  inventory_items: { face_value: number | string | null } | null;
};

export type TypeValuation = { type: string; count: number; totalValue: number };
export type StatusValuation = { status: string; count: number; totalValue: number };

export function toNumber(value: number | string | null): number {
  if (value === null || value === undefined) return 0;
  const numeric = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numeric) ? numeric : 0;
}

export function summarizeByType(items: ValuationItem[], status = "available"): TypeValuation[] {
  const totals = new Map<string, TypeValuation>();
  for (const item of items) {
    if (item.status !== status) continue;
    const key = item.type?.trim() || "Unspecified";
    const entry = totals.get(key) ?? { type: key, count: 0, totalValue: 0 };
    entry.count += 1;
    entry.totalValue += toNumber(item.face_value);
    totals.set(key, entry);
  }
  return [...totals.values()].sort((a, b) => b.totalValue - a.totalValue);
}

export function summarizeByStatus(items: ValuationItem[], statuses: string[]): StatusValuation[] {
  const totals = new Map<string, StatusValuation>(
    statuses.map((status) => [status, { status, count: 0, totalValue: 0 }])
  );
  for (const item of items) {
    const entry = totals.get(item.status) ?? { status: item.status, count: 0, totalValue: 0 };
    entry.count += 1;
    entry.totalValue += toNumber(item.face_value);
    totals.set(item.status, entry);
  }
  return statuses.map((status) => totals.get(status)!);
}

export function sumMovementValue(movements: ValuationMovement[], movementType: string): number {
  return movements
    .filter((movement) => movement.movement_type === movementType)
    .reduce(
      (total, movement) =>
        total + toNumber(movement.inventory_items?.face_value ?? null) * movement.quantity,
      0
    );
}
