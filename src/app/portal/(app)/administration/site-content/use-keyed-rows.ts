"use client";

import { useId, useState } from "react";

export type KeyedRow<T> = { id: string; value: T };

/**
 * Editable rows that keep their identity while their contents change.
 *
 * The list and document editors held their items in the parent's `values` as
 * plain arrays and rendered them with `key={index}`, so removing or moving one
 * shifted every key below it: React reused the wrong input for the wrong row
 * and focus, selection and caret position landed somewhere else (#792). An id
 * that belongs to the row rather than to its position fixes that, and is what
 * makes reordering possible at all.
 *
 * Ids are derived from `useId()` and a counter rather than `randomUUID()`, so
 * they are stable across a server and client render and the component stays
 * pure.
 *
 * The rows are seeded once, so a value replaced from outside -- Discard, or
 * "Back to default" -- does not reach them. Remount the component with a key
 * that changes on those, which is also what clears the browser's own control
 * state.
 */
export function useKeyedRows<T>(initial: T[], onChange: (values: T[]) => void) {
  const prefix = useId();
  const [rows, setRows] = useState<KeyedRow<T>[]>(() =>
    initial.map((value, index) => ({ id: `${prefix}-${index}`, value })),
  );
  const [nextIndex, setNextIndex] = useState(initial.length);

  function commit(next: KeyedRow<T>[]) {
    setRows(next);
    onChange(next.map((row) => row.value));
  }

  return {
    rows,
    update(id: string, value: T) {
      commit(rows.map((row) => (row.id === id ? { ...row, value } : row)));
    },
    add(value: T) {
      commit([...rows, { id: `${prefix}-${nextIndex}`, value }]);
      setNextIndex(nextIndex + 1);
    },
    remove(id: string) {
      commit(rows.filter((row) => row.id !== id));
    },
    /** Swaps a row with its neighbour. A move off either end is ignored. */
    move(id: string, direction: -1 | 1) {
      const from = rows.findIndex((row) => row.id === id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= rows.length) return;
      const next = [...rows];
      [next[from], next[to]] = [next[to], next[from]];
      commit(next);
    },
  };
}

export type KeyedRows<T> = ReturnType<typeof useKeyedRows<T>>;
