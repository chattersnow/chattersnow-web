"use client";

import { useCallback, useState } from "react";

/**
 * Opens a details sheet because the URL asked for it, and takes the ask back
 * out of the URL once it has been honored (#742).
 *
 * The submission notification emails link at one record -- an application, a
 * message -- not at the list it sits in, so the page has to arrive with that
 * record already open. The parameter is read on the server, where the page is
 * already parsing its filters, and handed down as `defaultOpen`; this hook
 * only owns what happens afterwards.
 *
 * Closing strips the parameter with `history.replaceState` rather than a
 * router navigation: the sheet is client state, and re-running the page's
 * server component and its queries to close a panel would be an odd thing to
 * pay for. `replaceState`, not `pushState`, because a Back that re-opened the
 * sheet the reader just dismissed is not what Back means -- and without the
 * strip, a refresh would re-open it too.
 */
export function useDeepLinkedSheet(param: string, defaultOpen: boolean) {
  const [open, setOpen] = useState(defaultOpen);

  // A second deep link arriving while this component is already mounted --
  // clicking another notification from the same page -- re-renders it in place
  // rather than remounting it, so the useState initializer alone would miss
  // the change. Adjusting state during render is React's documented pattern
  // for this, and unlike an effect it never lets the stale state paint.
  const [prevDefaultOpen, setPrevDefaultOpen] = useState(defaultOpen);
  if (defaultOpen !== prevDefaultOpen) {
    setPrevDefaultOpen(defaultOpen);
    setOpen(defaultOpen);
  }

  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) return;

      const url = new URL(window.location.href);
      if (!url.searchParams.has(param)) return;
      url.searchParams.delete(param);
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    },
    [param],
  );

  return { open, onOpenChange };
}
