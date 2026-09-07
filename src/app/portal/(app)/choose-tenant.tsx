"use client";

import { useState, useTransition } from "react";
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
import type { Tenant } from "@/lib/portal/tenants";
import { switchTenantAction } from "./tenant-switcher-actions";

/**
 * Shown instead of the portal shell when a signed-in account belongs to more
 * than one tenant and has not picked one yet (#707 Phase 2).
 *
 * From Phase 2 has_permission() answers for current_tenant_id(), which is
 * deliberately null in this state -- so without this page the layout would
 * read "no permissions anywhere" and bounce the user to the login screen with
 * a no-access error, and the switcher that would let them choose lives inside
 * the shell they can no longer reach.
 *
 * Standalone for the same reason as NoTenant: there is no tenant to draw a
 * nav for yet.
 */
export function ChooseTenant({ tenants }: { tenants: Tenant[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  function choose(tenantId: string) {
    setError(null);
    setPendingId(tenantId);
    startTransition(async () => {
      const result = await switchTenantAction(tenantId);
      if (result) {
        setError(result.error);
        setPendingId(null);
        return;
      }
      router.refresh();
    });
  }

  return (
    <main className="app-shell flex min-h-dvh items-center justify-center px-6 py-16">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building2 />
          </EmptyMedia>
          <EmptyTitle>Choose an organization</EmptyTitle>
          <EmptyDescription>
            This account belongs to more than one organization. Pick the one to
            work in — you can switch later from the top of the sidebar.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <ul className="flex w-full max-w-xs flex-col gap-2">
            {tenants.map((tenant) => (
              <li key={tenant.id}>
                <Button
                  className="w-full"
                  disabled={isPending || isSigningOut}
                  onClick={() => choose(tenant.id)}
                >
                  {pendingId === tenant.id && <Spinner />}
                  {tenant.name}
                </Button>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <Button
            variant="outline"
            disabled={isPending || isSigningOut}
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
