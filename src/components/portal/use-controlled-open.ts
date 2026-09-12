"use client";

import { useCallback, useState } from "react";

/**
 * Lets a dialog that owns its own `open` state also be opened from somewhere
 * else (#979).
 *
 * The six quick-action dialogs were each written as a self-contained
 * trigger-plus-form: the button that opens one is part of the component. That
 * is still how the sidebar uses them, so the state stays internal by default
 * and `open` is left `undefined`. The command palette has no trigger to render
 * -- it offers the action by name -- so it passes `open`/`onOpenChange` and
 * drives the same component from outside.
 *
 * `onOpenChange` fires for an internal close too (the backdrop, Escape, a
 * Cancel button), which is what keeps the caller's `activeAction` from getting
 * stuck on a dialog the user has already dismissed.
 */
export type ControlledOpenProps = {
  /** Left undefined, the dialog owns its open state, as it always has. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** False where the caller opens the dialog itself and has no button to hang
   *  a trigger off -- the same prop the artwork and application sheets use. */
  withTrigger?: boolean;
};

export function useControlledOpen(
  controlledOpen: boolean | undefined,
  onOpenChange?: (open: boolean) => void,
) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  return [open, setOpen] as const;
}
