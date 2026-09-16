"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { signOutAndRedirect } from "@/lib/auth/sign-out";

/**
 * Shown instead of the portal shell when a signed-in account holds a
 * membership but no *live* one (#707 Phase 1): every organization it belongs
 * to is suspended, or its support grant has expired. `my_tenant_ids()` filters
 * on both, so the account reads zero tenants while the membership row is still
 * there.
 *
 * It does not cover an account that belongs to nothing at all. That used to be
 * unreachable -- ensure_tenant_membership() joined any membership-less account
 * to the tenant the host resolved to -- and #1191 removed the join rather than
 * let a constituent with a public-site account (#1161) collect a membership by
 * opening /portal. The layout sends that case to
 * /portal/login?error=no_access instead, which is addressed to someone who has
 * not been granted access rather than to someone waiting on an invitation.
 *
 * Its sibling, ChooseTenant, covers the other empty state: several
 * memberships and no selection yet, where has_permission() answers "none" for
 * everything until one is picked (#707 Phase 2).
 *
 * Rendered as a standalone page rather than inside the shell: the nav, the
 * quick actions and the attention items all describe data this account cannot
 * reach, so a sidebar here would be a menu of dead ends. That also rules out
 * reusing LogoutButton, which renders into SidebarMenu and needs the provider.
 */
export function NoTenant() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  return (
    <main className="app-shell flex min-h-dvh items-center justify-center px-6 py-16">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building2 />
          </EmptyMedia>
          <EmptyTitle>No organization available</EmptyTitle>
          <EmptyDescription>
            Your sign-in worked, but the organization this account belongs to is
            not currently active, so there is nothing here to show you. An
            administrator there can sort this out.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant="outline"
            disabled={isSigningOut}
            onClick={() => {
              setIsSigningOut(true);
              void signOutAndRedirect(router);
            }}
          >
            {isSigningOut && <Spinner />}
            {isSigningOut ? "Signing out…" : "Sign out"}
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
