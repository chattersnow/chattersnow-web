"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { BrandLogo } from "@/components/brand-logo";
import type { Tenant } from "@/lib/portal/tenants";
import { switchTenantAction } from "./tenant-switcher-actions";

// The tenant's own logo when branding sets one (#707 Phase 4), else the
// default mark. Decorative either way: the adjacent text names the link.
function Logo({ logoUrl }: { logoUrl: string | null }) {
  return (
    <BrandLogo logoUrl={logoUrl} alt="" className="size-8 shrink-0" priority />
  );
}

const NAME_CLASS =
  "app-muted min-w-0 truncate text-sm font-semibold uppercase tracking-[0.14em] group-data-[collapsible=icon]:hidden";

/**
 * The tenant identity in the sidebar header.
 *
 * With a single membership -- which is every user until a second tenant is
 * provisioned -- this is deliberately not a control: it renders exactly the
 * link that was here before, with the tenant's name in place of the hardcoded
 * one. A menu whose only entry is the thing you are already looking at is
 * noise.
 */
export function TenantSwitcher({
  tenants,
  currentTenantId,
  logoUrl = null,
  hostPinned = false,
}: {
  tenants: Tenant[];
  currentTenantId: string | null;
  logoUrl?: string | null;
  /**
   * Whether the request host has already decided the tenant (#956). A menu
   * whose every other entry the next request would override is worse than no
   * menu: switching would appear to work and then silently undo itself.
   */
  hostPinned?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  // One membership, or none because the read failed -- the layout intercepts a
  // genuinely tenant-less account before this renders, so an empty list here
  // means the shell is running degraded and still needs its home link. A
  // host-pinned session takes the same branch for the reason above, naming the
  // tenant it is actually scoped to rather than whichever sorted first.
  if (hostPinned || tenants.length <= 1) {
    const name = hostPinned
      ? tenants.find((tenant) => tenant.id === currentTenantId)?.name
      : tenants[0]?.name;
    return (
      <Link
        href="/portal/home"
        className="flex min-w-0 items-center gap-2 px-2 py-1.5"
        // The name is hidden when the sidebar is collapsed to icons, which
        // takes it out of the accessibility tree with it. The logo is
        // decorative, so without this the link has no accessible name at all
        // in that state.
        aria-label={name ?? "Dashboard"}
      >
        <Logo logoUrl={logoUrl} />
        {name && <span className={NAME_CLASS}>{name}</span>}
      </Link>
    );
  }

  // currentTenantId is null when the user holds several memberships and has
  // not chosen one. That is a real state, not an error -- current_tenant_id()
  // refuses to guess -- so the trigger says so rather than showing a name the
  // rest of the page is not actually scoped to.
  const current = tenants.find((tenant) => tenant.id === currentTenantId);

  function select(tenant: Tenant) {
    if (tenant.id === currentTenantId) return;
    startTransition(async () => {
      const result = await switchTenantAction(tenant.id);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--purple-soft)] disabled:opacity-60"
        disabled={isPending}
        aria-label={
          current ? `Current account: ${current.name}` : "Choose an account"
        }
      >
        <Logo logoUrl={logoUrl} />
        <span className={NAME_CLASS}>{current ? current.name : "Choose…"}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-60 group-data-[collapsible=icon]:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {/* Base UI's GroupLabel has to sit inside a Group to be announced as
            the menu's name rather than throwing. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Switch account</DropdownMenuLabel>
          {tenants.map((tenant) => (
            <DropdownMenuItem
              key={tenant.id}
              onClick={() => select(tenant)}
              className="justify-between gap-2"
            >
              <span className="min-w-0 truncate">{tenant.name}</span>
              {tenant.id === currentTenantId && (
                <Check className="size-4 shrink-0" aria-label="Current" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
