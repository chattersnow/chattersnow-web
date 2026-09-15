import Link from "next/link";
import { cookies } from "next/headers";
import { UserRound } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/toast";
import { BrandLogoProvider } from "@/components/brand-logo-context";
import { SkipLink } from "@/components/skip-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { LexiconProvider } from "@/components/lexicon-context";
import { OfflineBanner } from "@/components/portal/offline-banner";
import { ServiceWorkerRegistrar } from "@/components/portal/service-worker-registrar";
import { CommandPalette } from "../command-palette";
import { HelpButton } from "../help/help-button";
import { IdleTimeout } from "../idle-timeout";
import { LogoutButton } from "../logout-button";
import { DemoBanner } from "../demo-banner";
import { NotificationsMenu } from "../notifications-menu";
import { PortalNav } from "../portal-nav";
import { TenantSwitcher } from "../tenant-switcher";
import { SidebarQuickActions } from "../sidebar-quick-actions";
import { CURRENT_RELEASE } from "../welcome/releases";
import { WelcomeDialog } from "../welcome/welcome-dialog";
import { WhatsNewDialog } from "../welcome/whats-new-dialog";
import type { PortalShellProps } from "./shell-props";

/**
 * The portal shell every desktop request has always had (#1079): a collapsible
 * sidebar, a sticky header and the page inside `SidebarInset`. Moved out of
 * `layout.tsx` unchanged when the mobile shell arrived, so a desktop render is
 * byte-identical to what it was before the split.
 */
export async function PortalShellDesktop({
  permissions,
  lexicon,
  branding,
  currentPerson,
  attentionItems,
  tenantContext,
  hostPinned,
  isDemo,
  displayName,
  welcomeOwed,
  whatsNewOwed,
  children,
}: PortalShellProps) {
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";
  // Left undefined until the reader has actually toggled the quick-actions
  // group, so SidebarQuickActions can fall back to its own rule (#979) rather
  // than to a default that ignores how many actions the role even has.
  const quickActionsCookie = cookieStore.get("quick_actions_state")?.value;

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      {/* Before <Sidebar>, not inside <SidebarInset>. Reaching the page
          content otherwise costs 25-40 tab stops on every navigation: the
          logo, the collapsed quick-actions row, 14 nav items with the open
          section expanded, account, log out, then the whole header. It used
          to sit inside the inset, which renders after the sidebar -- so a
          keyboard user tabbed through everything it was meant to skip
          before they could reach it (issue #595). */}
      <SkipLink href="#portal-main" />
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <TenantSwitcher
            tenants={tenantContext.tenants}
            currentTenantId={tenantContext.currentTenantId}
            logoUrl={branding.logoUrl}
            hostPinned={hostPinned}
          />
        </SidebarHeader>
        <SidebarContent className="scroll-smooth">
          <SidebarQuickActions
            permissions={permissions}
            currentPerson={currentPerson}
            defaultOpen={
              quickActionsCookie ? quickActionsCookie === "true" : undefined
            }
          />
          <PortalNav permissions={permissions} lexicon={lexicon} />
        </SidebarContent>
        <SidebarFooter>
          {/* Not in PortalNav: that list is permission-scoped module nav,
              and every signed-in user has an account page. */}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="My Account"
                render={<Link href="/portal/account" />}
              >
                <UserRound />
                <span>My Account</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <LogoutButton />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-(--portal-header-height) items-center gap-3 border-b border-[var(--line)] bg-[var(--background)] px-6 py-4 sm:px-10">
          <SidebarTrigger />
          {/* The label is hidden below `sm`, which takes it out of the
              accessibility tree too, so the link carries its own name. */}
          <Link
            href="/portal/home"
            aria-label="Operations Portal home"
            className="flex items-center"
          >
            <span className="app-muted hidden text-sm font-semibold uppercase tracking-[0.14em] sm:inline">
              Operations Portal
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            {displayName && (
              <Link
                href="/portal/account"
                className="hidden max-w-48 truncate text-base font-semibold text-[var(--purple)] hover:underline sm:inline"
              >
                Hi, {displayName}
              </Link>
            )}
            <CommandPalette
              permissions={permissions}
              lexicon={lexicon}
              currentPerson={currentPerson}
            />
            <ThemeToggle className="size-10 rounded-full" />
            <HelpButton />
            <NotificationsMenu items={attentionItems} />
          </div>
        </header>
        {isDemo && <DemoBanner />}
        {/* Not a phone-only concern (#1083): a laptop on a venue's wifi drops
            the same connection, and the banner is what keeps a write that went
            nowhere from looking like one that landed. */}
        <OfflineBanner />
        <main
          id="portal-main"
          // Focusable only as a skip-link target, so focus actually lands
          // in the content rather than staying on the link.
          tabIndex={-1}
          className="app-shell px-6 py-8 outline-none sm:px-10"
        >
          <div className="mx-auto max-w-6xl">
            {/* The tenant's own mark for the inventory placeholders, which
                sit too deep -- and in a client modal -- to be handed it.
                Its words likewise: the breadcrumbs on a few dozen pages
                read the nav tree, which holds lexicon templates (#896). */}
            <BrandLogoProvider logoUrl={branding.logoUrl}>
              <LexiconProvider lexicon={lexicon}>{children}</LexiconProvider>
            </BrandLogoProvider>
          </div>
        </main>
        {/* Rendered here rather than on the dashboard: the sidebar, help
            button and bell the tour explains are all part of this shell,
            and a new user's first URL is often an invite deep link.

            Mounted conditionally rather than always-rendered-and-hidden:
            each dialog seeds its own open state at mount and this layout
            doesn't remount on navigation, so unmounting when the flag
            clears is what lets "Show the tour again" (or a release bump)
            bring it back. Only one is ever mounted -- whatsNewOwed already
            excludes welcomeOwed. */}
        {welcomeOwed && (
          <WelcomeDialog key="welcome" initialOpen permissions={permissions} />
        )}
        {whatsNewOwed && <WhatsNewDialog key={CURRENT_RELEASE} initialOpen />}
        {/* Mounted here because this shell is the one thing that doesn't
            remount on navigation, so the idle clock survives moving around
            the portal -- and because everything inside `(app)` is already
            past the signed-in guard above, which is what keeps the timeout
            off the login page and off every public route. */}
        <IdleTimeout />
        <ServiceWorkerRegistrar />
        {/* One viewport for the whole portal: the sidebar quick actions
            save from every route, so the confirmation has to live above
            the page rather than inside it. */}
        <Toaster />
      </SidebarInset>
    </SidebarProvider>
  );
}
