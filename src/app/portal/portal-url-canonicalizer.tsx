"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  PORTAL_HOST,
  isPortalPathname,
  stripPortalPrefix,
} from "@/lib/portal/paths";

/**
 * Keeps the address bar prefix-free on the portal host.
 *
 * The proxy strips `/portal` from document requests, but client-side
 * navigation never reaches it: Next's router pushes the literal `href`, so
 * every `<Link href="/portal/events">` in the app would put
 * portal.chattersnow.org/portal/events in the address bar. Rewriting the 449
 * canonical links to be host-aware isn't worth it -- they have to keep
 * working unchanged on localhost and previews, where the portal shares one
 * host with the public site -- so the visible URL is corrected here instead.
 *
 * `usePathname()` therefore reports the stripped path on this host; anything
 * matching against canonical paths must run it through `toPortalPathname()`.
 */
export function PortalUrlCanonicalizer() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.location.hostname !== PORTAL_HOST) return;
    if (!isPortalPathname(window.location.pathname)) return;

    // Carries the existing history state forward: Next keeps its router tree
    // in there, and replacing it with null strands the back button.
    window.history.replaceState(
      window.history.state,
      "",
      stripPortalPrefix(window.location.pathname) +
        window.location.search +
        window.location.hash,
    );
  }, [pathname]);

  return null;
}
