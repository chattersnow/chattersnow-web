import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getServerSnapshot() {
  return false;
}

/**
 * Hydration-safe: the first client render uses the server's answer (desktop)
 * and React re-renders once the real viewport is known. Reading
 * window.innerWidth in the initial state made the first client render
 * disagree with the server HTML on phones (the sidebar swaps a <Sheet> for
 * its desktop markup), so React threw the whole tree away and re-rendered
 * it -- losing anything already typed into an input on the page.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
