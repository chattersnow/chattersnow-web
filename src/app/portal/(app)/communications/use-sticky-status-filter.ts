import { useState } from "react";

/**
 * Pins a status filter (typically seeded from a `?status=` deep link) while
 * keeping any item that already matched it visible, even after a status
 * mutation triggered by viewing the item (e.g. auto-marking a message
 * "read" on open) would otherwise drop it out of the filtered set (#430).
 *
 * The pin is released -- and the sticky set cleared -- whenever the filter
 * itself changes, whether from a new deep link or the caller picking a
 * different status, matching the acceptance criteria that stickiness lasts
 * only "until the user navigates away or explicitly changes the filter."
 */
export function useStickyStatusFilter<
  TStatus extends string,
  TItem extends { id: string; status: TStatus },
>(items: readonly TItem[], initialStatus: TStatus | null) {
  const [status, setStatusState] = useState(initialStatus);
  const [stickyIds, setStickyIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  // A new `initialStatus` prop means a fresh deep link -- e.g. clicking
  // another notification while already on this page re-renders this
  // component in place instead of remounting it, so the `useState`
  // initializer alone won't pick up the change. Adjusting state during
  // render (React's documented pattern for this) rather than in an effect
  // means the stale filter never has a chance to flash on screen.
  const [prevInitialStatus, setPrevInitialStatus] = useState(initialStatus);
  if (initialStatus !== prevInitialStatus) {
    setPrevInitialStatus(initialStatus);
    setStatusState(initialStatus);
    setStickyIds(new Set());
  }

  // Grow the sticky set with anything currently matching the pinned status,
  // so items that started out visible stay that way once a mutation moves
  // them off it. Comparing against the existing set keeps this a no-op
  // once nothing new matches, instead of looping state updates.
  if (status !== null) {
    let grown: Set<string> | null = null;
    for (const item of items) {
      if (item.status === status && !stickyIds.has(item.id)) {
        grown ??= new Set(stickyIds);
        grown.add(item.id);
      }
    }
    if (grown) setStickyIds(grown);
  }

  function setStatus(next: TStatus | null) {
    setStatusState(next);
    setStickyIds(new Set());
  }

  function isVisible(item: TItem) {
    return status === null || stickyIds.has(item.id);
  }

  return { status, setStatus, isVisible };
}
