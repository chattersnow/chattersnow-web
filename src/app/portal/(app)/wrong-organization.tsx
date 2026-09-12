"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { tenantPortalUrl } from "@/lib/portal/paths";
import type { Tenant } from "@/lib/portal/tenants";

/**
 * Shown instead of the portal shell when the request host belongs to an
 * organization the signed-in account is not a member of (#956).
 *
 * The portal used to ignore the host completely, so signing in on the public
 * demo's domain with a paying tenant's credentials served that tenant's
 * portal. Nothing leaked -- `current_tenant_id()` is membership-based, so the
 * account only ever saw its own organization -- but a host serving an
 * organization that does not own it is wrong on its face, and it is the sort
 * of wrong that gets noticed on the one domain we hand to strangers.
 *
 * Standalone rather than inside the shell, for the reason NoTenant gives: the
 * nav, quick actions and attention items would all describe data this request
 * is not allowed to render.
 *
 * The way out matters as much as the refusal. Someone who mistyped a domain,
 * or followed a stale bookmark, has no idea why their password suddenly
 * "stopped working" -- so this names both organizations and links to the
 * portal of one the account actually belongs to. Tenants without a
 * `custom_domain` have no host to offer, so they are named but not linked.
 */
export function WrongOrganization({
  hostTenantName,
  tenants,
}: {
  hostTenantName: string;
  tenants: Tenant[];
}) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const destinations = tenants.flatMap((tenant) => {
    const href = tenantPortalUrl(tenant.custom_domain);
    return href ? [{ id: tenant.id, name: tenant.name, href }] : [];
  });
  const belongsTo = new Intl.ListFormat("en", {
    style: "long",
    type: "conjunction",
  }).format(tenants.map((tenant) => tenant.name));

  return (
    <main className="app-shell flex min-h-dvh items-center justify-center px-6 py-16">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building2 />
          </EmptyMedia>
          <EmptyTitle>Wrong organization</EmptyTitle>
          <EmptyDescription>
            This is the {hostTenantName} portal, and your account belongs to{" "}
            {belongsTo}. Sign-in worked — you are just on the wrong address.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <ul className="flex w-full max-w-xs flex-col gap-2">
            {destinations.map((tenant) => (
              <li key={tenant.id}>
                {/* A styled anchor rather than <Button render={<a/>}>: Base UI
                    puts role="button" on a non-native element, and this is the
                    one control on the page that genuinely is a link. It leaves
                    the origin, so it must keep a link's affordances -- open in
                    a new tab, copy the address -- and be announced as one.
                    Plain <a>, not next/link: cross-origin, so there is nothing
                    to prefetch and no client-side navigation to make. */}
                <a
                  href={tenant.href}
                  className={cn(buttonVariants(), "w-full")}
                >
                  Go to {tenant.name}
                </a>
              </li>
            ))}
          </ul>
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
