"use client";

import { createContext, useContext } from "react";

/** What the signed-in user may do with rider profiles (#1408). */
export type RiderProfileAccess = { canView: boolean; canManage: boolean };

const RiderProfileContext = createContext<RiderProfileAccess>({
  canView: true,
  canManage: true,
});

/**
 * The caller's `rider_profiles` levels, made readable from any client
 * component in the portal (#1408).
 *
 * The rider fields sit inside the shared person form, which renders from the
 * person record, the new-person dialog and the person picker that half the
 * portal embeds -- so this is distribution, the same argument
 * `PortalDeviceProvider` makes, rather than threading a flag through every
 * picker. `rider_profiles` carries the `rider_profile` module, so both levels
 * are false for everyone on a tenant without it.
 *
 * Defaults to both true, which is what the person form did before this
 * existed: a form rendered outside the portal layout -- a unit test -- keeps
 * its rider fields. Every real portal render is inside the provider.
 */
export function PortalRiderProfileProvider({
  access,
  children,
}: {
  access: RiderProfileAccess;
  children: React.ReactNode;
}) {
  return (
    <RiderProfileContext.Provider value={access}>
      {children}
    </RiderProfileContext.Provider>
  );
}

export function useRiderProfileAccess(): RiderProfileAccess {
  return useContext(RiderProfileContext);
}
