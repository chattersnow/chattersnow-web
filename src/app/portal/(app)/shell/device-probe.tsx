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
 * What this browser is, measured in a way that a rotation cannot change.
 *
 * The first version read `window.innerWidth` alone, and that was wrong in a
 * way no emulator caught: an iPhone 15 Pro Max is 430px in portrait and 932px
 * in landscape, so turning the phone once wrote `device_override=desktop`, and
 * the next portal navigation -- back in portrait -- was served the desktop
 * shell at 430px, which is a layout you have to zoom out to read. It corrected
 * itself one navigation later, which is exactly what made it look intermittent
 * rather than broken.
 *
 * Two changes fix it. The width used is the *shorter* side, which is the same
 * number in both orientations, so a rotation is not a device change. And it is
 * gated on a coarse pointer, so a narrow desktop window -- 1200x700, whose
 * shorter side is under the breakpoint -- is still a desktop. A tablet is
 * coarse but its shorter side is well past the breakpoint, which keeps it on
 * the desktop shell exactly as `resolveDeviceClass` decides for its UA.
 */
function measureDevice(): DeviceClass {
  const coarsePointer =
    window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const shorterSide = Math.min(window.innerWidth, window.innerHeight);
  return coarsePointer && shorterSide < MOBILE_BREAKPOINT
    ? "mobile"
    : "desktop";
}

/**
 * Corrects the shell on the *next* request when the user-agent got it wrong.
 *
 * UA sniffing cannot see a viewport: a phone in desktop mode says it is a
 * desktop. This measures the real device once and, only when it disagrees with
 * what the proxy decided, writes `device_override` so the following navigation
 * is right.
 *
 * Deliberately no reload: swapping the shell out from under someone mid-page
 * is exactly the flash this ticket exists to remove, and the wrong shell is
 * usable -- both render the same pages. It settles on the next navigation,
 * which on a phone is seconds away.
 */
export function DeviceProbe({ device }: { device: DeviceClass }) {
  useEffect(() => {
    const measured = measureDevice();
    if (measured === device) return;
    // Session-scoped and same-site: it decides a layout, so it has no reason
    // to outlive the browser session or to travel anywhere.
    document.cookie = `${DEVICE_OVERRIDE_COOKIE}=${measured}; path=/; SameSite=Lax`;
  }, [device]);

  return null;
}
