"use client";

import { createContext, useContext } from "react";
import type { DeviceClass } from "@/proxy";

const PortalDeviceContext = createContext<DeviceClass>("desktop");

/**
 * The layout's device class, made readable from any client component (#1115).
 *
 * `deviceClass()` is a server function and the portal layout is the one thing
 * that calls it, so a dialog buried six components down a client tree has no
 * way to ask. The shells solved that by forking their own markup; a form
 * cannot, because the component that owns a form is almost never the component
 * that knows what it is being rendered on.
 *
 * This is distribution, not a second derivation -- the value handed down is
 * the same one `deviceClass()` returned for this request, so the rule in
 * `./device.ts` ("nothing else re-derives the decision") still holds. The
 * alternative, threading `device` through every page to every dialog the way
 * `PortalRail` is threaded, is 58 call sites of prop drilling and one missed
 * page away from a phone rendering a desktop dialog.
 *
 * The default is `desktop`, matching `deviceClass()`'s own fallback: a form
 * rendered outside the portal layout -- the public site, a unit test -- behaves
 * exactly as it did before this existed.
 */
export function PortalDeviceProvider({
  device,
  children,
}: {
  device: DeviceClass;
  children: React.ReactNode;
}) {
  return (
    <PortalDeviceContext.Provider value={device}>
      {children}
    </PortalDeviceContext.Provider>
  );
}

export function usePortalDevice(): DeviceClass {
  return useContext(PortalDeviceContext);
}
