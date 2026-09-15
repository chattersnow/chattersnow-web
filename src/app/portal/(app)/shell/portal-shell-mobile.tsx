import Link from "next/link";
import { Toaster } from "@/components/ui/toast";
import { BrandLogoProvider } from "@/components/brand-logo-context";
import { SkipLink } from "@/components/skip-link";
import { BrandLogo } from "@/components/brand-logo";
import { LexiconProvider } from "@/components/lexicon-context";
import { OfflineBanner } from "@/components/portal/offline-banner";
import { ServiceWorkerRegistrar } from "@/components/portal/service-worker-registrar";
import { CommandPalette } from "../command-palette";
import { HelpButton } from "../help/help-button";
import { IdleTimeout } from "../idle-timeout";
import { DemoBanner } from "../demo-banner";
import { NotificationsMenu } from "../notifications-menu";
import { CURRENT_RELEASE } from "../welcome/releases";
import { WelcomeDialog } from "../welcome/welcome-dialog";
import { WhatsNewDialog } from "../welcome/whats-new-dialog";
import { MobileNav } from "./mobile-nav";
import { AttentionItemsProvider } from "./attention-context";
import type { PortalShellProps } from "./shell-props";

/**
 * The portal shell a phone gets (#1079).
 *
 * Not the desktop shell with things hidden: no sidebar markup reaches the
 * response at all. A compact header carries the organization's identity and
 * the three controls that answer a question about the page you are on --
 * search, help and the bell -- and everything else lives in the bottom tab bar
 * or the sheet behind its "More" button.
 *
 * The dialogs, idle timeout and toaster mount here for the same reasons they
 * mount in the desktop shell: this is the one tree that survives a navigation.
 */
export function PortalShellMobile({
  permissions,
  lexicon,
  branding,
  currentPerson,
  attentionItems,
  tenantContext,
  isDemo,
  welcomeOwed,
  whatsNewOwed,
  children,
}: PortalShellProps) {
  const tenantName =
    tenantContext.tenants.find(
      (tenant) => tenant.id === tenantContext.currentTenantId,
    )?.name ?? "Operations Portal";

  return (
    /* `data-portal-shell` is what the tap-target rule in globals.css keys off
       (#1117). It is matched through `:root:has(...)` rather than as an
       ancestor, because dialogs, sheets and dropdown menus portal to
       `document.body` and would otherwise keep desktop-sized targets. */
    <div data-portal-shell="mobile" className="flex min-h-dvh flex-col">
      <SkipLink href="#portal-main" />
      <header className="sticky top-0 z-20 flex h-(--portal-header-height) items-center gap-2 border-b border-[var(--line)] bg-[var(--background)] px-4">
        <Link
          href="/portal/home"
          aria-label={`${tenantName} portal home`}
          className="flex min-w-0 items-center gap-2"
        >
          {/* The shared component, not a hand-rolled <Image>: it renders a
              tenant's upload `fill` inside a box this caller sizes -- a logo is
              whatever shape it was uploaded in -- and draws the placeholder
              mark for a tenant that has set none, which the desktop shell's
              TenantSwitcher has always done and this header did not. */}
          <BrandLogo
            logoUrl={branding.logoUrl}
            alt=""
            className="size-7 shrink-0"
          />
          <span className="truncate text-base font-semibold text-[var(--purple-deep)]">
            {tenantName}
          </span>
        </Link>
        {/* The three controls that answer a question about the page you are
            on. The theme toggle and the account link are preferences rather
            than page actions, so they live in the sheet -- a phone header
            carrying six controls leaves no room for the name of the
            organization you are in. Help stays here on purpose: it is
            contextual to the current route, and a contextual control behind a
            menu is one nobody finds. */}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <CommandPalette
            permissions={permissions}
            lexicon={lexicon}
            currentPerson={currentPerson}
          />
          <HelpButton />
          <NotificationsMenu items={attentionItems} />
        </div>
      </header>
      {isDemo && <DemoBanner />}
      <OfflineBanner />
      <main
        id="portal-main"
        tabIndex={-1}
        // Bottom padding clears the fixed tab bar, which would otherwise sit
        // on top of the last thing on every page.
        className="app-shell grow px-4 pt-6 pb-24 outline-none"
      >
        <BrandLogoProvider logoUrl={branding.logoUrl}>
          <LexiconProvider lexicon={lexicon}>
            {/* So the dashboard can lead with what needs this reader without
                re-running the layout's seven attention queries. */}
            <AttentionItemsProvider items={attentionItems}>
              {children}
            </AttentionItemsProvider>
          </LexiconProvider>
        </BrandLogoProvider>
      </main>
      <MobileNav permissions={permissions} lexicon={lexicon} />
      {welcomeOwed && (
        <WelcomeDialog key="welcome" initialOpen permissions={permissions} />
      )}
      {whatsNewOwed && <WhatsNewDialog key={CURRENT_RELEASE} initialOpen />}
      <IdleTimeout />
      <ServiceWorkerRegistrar />
      <Toaster />
    </div>
  );
}
