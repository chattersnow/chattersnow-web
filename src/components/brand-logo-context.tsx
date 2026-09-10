"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * The tenant's own logo, for components too deep to be handed it.
 *
 * `BrandLogo` takes a `logoUrl` prop because its callers -- the public header
 * and footer, the portal sidebar, the login pages -- all sit in a layout that
 * has just read the branding. `BrandImageFallback` does not: it renders inside
 * event cards, gear cards and a client-side cart sheet, seven call sites deep
 * in trees that have no reason to know anything about branding. Threading a
 * logo through all of them to reach a placeholder tile is the kind of prop that
 * gets dropped from the eighth caller, which is how the placeholder came to be
 * hardcoded in the first place.
 *
 * The default is `null`, so a subtree with no provider draws the unset mark
 * rather than borrowing anyone's. That is the direction a mistake here should
 * fail in: showing no logo is a cosmetic loss, and showing another
 * organization's is the bug this exists to prevent.
 */
const BrandLogoContext = createContext<string | null>(null);

export function BrandLogoProvider({
  logoUrl,
  children,
}: {
  logoUrl: string | null;
  children: ReactNode;
}) {
  return (
    <BrandLogoContext.Provider value={logoUrl}>
      {children}
    </BrandLogoContext.Provider>
  );
}

/** The current tenant's logo, or null where it has set none. */
export function useBrandLogoUrl(): string | null {
  return useContext(BrandLogoContext);
}
