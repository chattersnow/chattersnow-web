import { useMemo, useRef, useState } from "react";

export type FormTabHandle = {
  discard: () => void;
};

export type FormTabCallbacks = {
  onPendingChange: (value: boolean) => void;
  onDirtyChange: (value: boolean) => void;
  registerHandle: (handle: FormTabHandle | null) => void;
};

/**
 * Tracks pending/dirty state and discard handles for a fixed set of
 * ref-tracked form tabs, so a dialog with several independently-saveable
 * tabs doesn't need a useRef + two useCallbacks hand-written per tab.
 */
export function useFormTabState<TTab extends string>(
  formTabs: readonly TTab[],
) {
  const [pending, setPending] = useState<Partial<Record<TTab, boolean>>>({});
  const [dirty, setDirty] = useState<Partial<Record<TTab, boolean>>>({});
  const handles = useRef(new Map<TTab, FormTabHandle | null>());

  // Each tab's callbacks are created once and reused for the lifetime of
  // the formTabs list — child tabs use these as effect dependencies, so a
  // new function identity every render would re-fire those effects.
  const callbacks = useMemo(() => {
    const map = {} as Record<TTab, FormTabCallbacks>;
    for (const tabId of formTabs) {
      map[tabId] = {
        onPendingChange: (value) =>
          setPending((prev) => ({ ...prev, [tabId]: value })),
        onDirtyChange: (value) =>
          setDirty((prev) => ({ ...prev, [tabId]: value })),
        registerHandle: (handle) => {
          handles.current.set(tabId, handle);
        },
      };
    }
    return map;
    // formTabs is a static, module-level list in every current caller, so
    // its reference identity is a stable dependency.
  }, [formTabs]);

  const anyDirty = Object.values(dirty).some(Boolean);

  function discardAll() {
    for (const handle of handles.current.values()) {
      handle?.discard();
    }
  }

  return { pending, dirty, anyDirty, callbacks, discardAll };
}
