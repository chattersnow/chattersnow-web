"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ACCOUNT_NAV_OFF,
  type AccountClaims,
  type ConstituentAccountNav,
  constituentAccountNav,
} from "@/lib/constituent/account-nav";

const AccountNavContext = createContext<ConstituentAccountNav>(ACCOUNT_NAV_OFF);

/**
 * Who is signed in, for the public header and footer -- read in the browser
 * (#1467).
 *
 * It was read on the server by the public layout (#1175), which made every
 * public page's HTML depend on the visitor's session and so impossible to
 * share: nothing could be served from the CDN, and each crawler and each
 * visitor paid for a full render. With the account resolved here, the server
 * renders the same page for everyone on a host, and `src/proxy.ts` can let the
 * CDN hold it.
 *
 * `enabled` is still the server's to say, because it is the tenant's setting
 * rather than the visitor's, and a tenant without the module must render no
 * control at all -- not one that appears after load.
 *
 * The session comes from `onAuthStateChange`, whose first event reports the
 * stored session without a network round trip, and whose later ones follow a
 * sign-in or sign-out made anywhere in this tab through the shared browser
 * client. It is not verified against the Auth server, and needs not be: this
 * only chooses between "Sign in" and a name. `/my` authorizes on the server.
 *
 * Until that first event the control renders signed out, which is what the
 * server rendered and what nearly every visitor is. Below `xl` the two states
 * are the same icon, so a signed-in visitor sees at most the name arrive.
 */
export function AccountNavProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<AccountClaims | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const supabase = createSupabaseBrowserClient();
    // No Supabase call inside the callback: the client holds a lock while it
    // runs, and awaiting another auth method there deadlocks.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [enabled]);

  return (
    <AccountNavContext.Provider value={constituentAccountNav(enabled, user)}>
      {children}
    </AccountNavContext.Provider>
  );
}

/** The account control's state; off outside an `AccountNavProvider`. */
export function useAccountNav(): ConstituentAccountNav {
  return useContext(AccountNavContext);
}
