import * as React from "react";

/**
 * The IANA timezone the viewer's browser is in, or null on the server.
 *
 * The portal's half of the date/time convention (#1057) is that an instant is
 * displayed in the viewer's own zone. That is only true of surfaces rendered
 * in the *browser*: `formatInstantDate` / `formatDateTime` build an
 * `Intl.DateTimeFormat` with no `timeZone`, which resolves to whatever zone
 * the running process is in -- the browser in a client component, but UTC on
 * Vercel in a server component. Around twenty portal surfaces were therefore
 * showing UTC to everybody (#1064).
 *
 * Reading the zone during render is what makes that fixable, and also what
 * makes it a hydration hazard: the server cannot know the answer, so the
 * server HTML and the first client render would disagree and React would throw
 * the tree away. `useSyncExternalStore` is how this codebase already solves
 * that (`use-mobile.ts`, `theme-provider.tsx`) -- the first client render uses
 * `getServerSnapshot`, matching the HTML, and React re-renders once with the
 * real answer. No manual effect, and no `set-state-in-effect` lint failure.
 *
 * Null is deliberately the server answer rather than a guessed zone: a caller
 * has to decide what to render before the browser has spoken, and the honest
 * choices differ by surface (an event's own zone where there is one, UTC
 * otherwise). See `ViewerTime`.
 */

// The viewer's timezone cannot change while the page is open -- it comes from
// the OS, and a change there does not notify a live document -- so there is
// nothing to subscribe to. The unsubscribe is what React calls on unmount.
function subscribe() {
  return () => {};
}

function getSnapshot(): string | null {
  // Object.is compares the returned string by value, so re-deriving it on
  // every call is stable and does not loop.
  return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
}

function getServerSnapshot(): string | null {
  return null;
}

export function useViewerTimeZone(): string | null {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
