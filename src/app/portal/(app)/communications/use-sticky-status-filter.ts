import { useState } from "react";

/**
 * Pins a filter (typically seeded from a deep link like `?status=` or
 * `?claimed=`) while keeping any item that already matched it visible, even
 * after a mutation triggered from the item (e.g. auto-marking a message
 * "read" on open, or claiming it from the Unclaimed view) would otherwise
 * drop it out of the filtered set (#430, #1670).
 *
 * The pin is released -- and the sticky set cleared -- whenever the filter
 * itself changes, whether from a new deep link or the caller picking a
 * different value, matching the acceptance criteria that stickiness lasts
 * only "until the user navigates away or explicitly changes the filter."
 */
export function useStickyFilter<
  TValue extends string,
  TItem extends { id: string },
>(
  items: readonly TItem[],
  initialValue: TValue | null,
  matches: (item: TItem, value: TValue) => boolean,
) {
  const [value, setValueState] = useState(initialValue);
  const [stickyIds, setStickyIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  // A new `initialValue` prop means a fresh deep link -- e.g. clicking
  // another notification while already on this page re-renders this
  // component in place instead of remounting it, so the `useState`
  // initializer alone won't pick up the change. Adjusting state during
  // render (React's documented pattern for this) rather than in an effect
  // means the stale filter never has a chance to flash on screen.
  const [prevInitialValue, setPrevInitialValue] = useState(initialValue);
  if (initialValue !== prevInitialValue) {
    setPrevInitialValue(initialValue);
    setValueState(initialValue);
    setStickyIds(new Set());
  }

  // Grow the sticky set with anything currently matching the pinned value,
  // so items that started out visible stay that way once a mutation moves
  // them off it. Comparing against the existing set keeps this a no-op
  // once nothing new matches, instead of looping state updates.
  if (value !== null) {
    let grown: Set<string> | null = null;
    for (const item of items) {
      if (matches(item, value) && !stickyIds.has(item.id)) {
        grown ??= new Set(stickyIds);
        grown.add(item.id);
      }
    }
    if (grown) setStickyIds(grown);
  }

  function setValue(next: TValue | null) {
    setValueState(next);
    setStickyIds(new Set());
  }

  function isVisible(item: TItem) {
    return value === null || stickyIds.has(item.id);
  }

  return { value, setValue, isVisible };
}

/** `useStickyFilter` on an item's `status`. */
export function useStickyStatusFilter<
  TStatus extends string,
  TItem extends { id: string; status: TStatus },
>(items: readonly TItem[], initialStatus: TStatus | null) {
  const { value, setValue, isVisible } = useStickyFilter(
    items,
    initialStatus,
    (item: TItem, status: TStatus) => item.status === status,
  );
  return { status: value, setStatus: setValue, isVisible };
}
