export type DiffEntry = {
  key: string;
  before: unknown;
  after: unknown;
  changed: boolean;
};

export function computeDiff(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
): DiffEntry[] {
  const keys = new Set([
    ...Object.keys(oldData ?? {}),
    ...Object.keys(newData ?? {}),
  ]);
  return [...keys].sort().map((key) => {
    const before = oldData?.[key] ?? null;
    const after = newData?.[key] ?? null;
    return {
      key,
      before,
      after,
      changed: JSON.stringify(before) !== JSON.stringify(after),
    };
  });
}
