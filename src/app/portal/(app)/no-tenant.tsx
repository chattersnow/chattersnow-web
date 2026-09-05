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
 * Shown instead of the portal shell when a signed-in account belongs to no
 * tenant (#707 Phase 1).
 *
 * Unreachable today: ensure_tenant_membership() joins any account to the one
 * tenant that exists. It becomes reachable the moment a second is provisioned,
 * because that auto-join deliberately stops -- a stray signup must not land in
 * somebody else's organization. Building it now means the first white-label
 * deployment gets an explanation rather than an empty shell.
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
          <EmptyTitle>No organization yet</EmptyTitle>
          <EmptyDescription>
            Your sign-in worked, but this account has not been added to an
            organization. Ask whoever invited you to add you, then sign in
            again.
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
