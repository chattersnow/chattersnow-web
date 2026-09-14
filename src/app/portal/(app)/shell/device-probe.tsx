"use client";

import { useEffect } from "react";
import { DEVICE_OVERRIDE_COOKIE, type DeviceClass } from "@/proxy";

/**
 * The breakpoint the shell decision uses, matching `useIsMobile()`'s.
 * Two different answers to "is this a phone" inside one page would be worse
 * than either answer alone.
 */
const MOBILE_BREAKPOINT = 768;

/**
 * Corrects the shell on the *next* request when the user-agent got it wrong.
 *
 * UA sniffing cannot see a viewport: a phone in desktop mode says it is a
 * desktop, and a desktop browser at 400px wide says it is a desktop too. This
 * measures the real width once and, only when it disagrees with what the
 * proxy decided, writes `device_override` so the following navigation is
 * right.
 *
 * Deliberately no reload: swapping the shell out from under someone mid-page
 * is exactly the flash this ticket exists to remove, and the wrong shell is
 * usable -- both render the same pages. It settles on the next navigation,
 * which on a phone is seconds away.
 */
export function DeviceProbe({ device }: { device: DeviceClass }) {
  useEffect(() => {
    const measured: DeviceClass =
      window.innerWidth < MOBILE_BREAKPOINT ? "mobile" : "desktop";
    if (measured === device) return;
    // Session-scoped and same-site: it decides a layout, so it has no reason
    // to outlive the browser session or to travel anywhere.
    document.cookie = `${DEVICE_OVERRIDE_COOKIE}=${measured}; path=/; SameSite=Lax`;
  }, [device]);

  return null;
}
