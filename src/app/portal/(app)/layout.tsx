import Link from "next/link";
import { UserRound } from "lucide-react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  DEFAULT_DESTINATION,
  safePortalDestination,
} from "@/lib/auth/next-destination";
import { PORTAL_PATH_HEADER } from "@/proxy";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import {
  getAccessManagementAttentionSummary,
  getCalendarCoverageReminderSummary,
  getOpsInboxSummary,
  getPendingApprovalsSummary,
} from "@/lib/portal/attention-items";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrandLogoProvider } from "@/components/brand-logo-context";
import { BrandStyle } from "@/components/brand-style";
import { SkipLink } from "@/components/skip-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "./command-palette";
import { HelpButton } from "./help/help-button";
import { PortalHelpProvider } from "./help/help-context";
import { getContentWorkSummary } from "./home/queries";
import { ensureCurrentPerson } from "@/lib/auth/current-person";
import {
  currentTenant,
  decideHostTenant,
  getTenantContext,
  isDemoTenant,
} from "@/lib/portal/tenants";
import { getTenantBranding } from "@/lib/tenant-branding";
import { getPortalVocabulary } from "@/lib/tenant-person-roles";
import { LexiconProvider } from "@/components/lexicon-context";
import { ensureMyOnboarding } from "@/lib/portal/onboarding";
import { personDisplayName } from "@/lib/format";
import { IdleTimeout } from "./idle-timeout";
import { LogoutButton } from "./logout-button";
import { ChooseTenant } from "./choose-tenant";
import { DemoBanner } from "./demo-banner";
import { NoTenant } from "./no-tenant";
import { NotificationsMenu } from "./notifications-menu";
import { PortalNav } from "./portal-nav";
import { TenantSwitcher } from "./tenant-switcher";
import { WrongOrganization } from "./wrong-organization";
import { SidebarQuickActions } from "./sidebar-quick-actions";
import { CURRENT_RELEASE, RELEASE_NOTES } from "./welcome/releases";
import { WelcomeDialog } from "./welcome/welcome-dialog";
import { WhatsNewDialog } from "./welcome/whats-new-dialog";

export default async function PortalAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // The proxy stamps the requested path on the request; a layout can't see
    // it on its own. Without this, every shared portal link lands a signed-out
    // recipient on the dashboard with their destination gone.
    const requestHeaders = await headers();
    const next = safePortalDestination(requestHeaders.get(PORTAL_PATH_HEADER));
    redirect(
      next === DEFAULT_DESTINATION
        ? "/portal/login"
        : `/portal/login?next=${encodeURIComponent(next)}`,
    );
  }

  // Tenant before permissions: from #707 Phase 2, has_permission() and
  // my_permissions() answer for current_tenant_id(), so the two states where
  // that is null -- no membership, or several and no choice yet -- would
  // otherwise read as "no access" and bounce a legitimate account to the
  // login screen. Also joins a first-time account to the tenant, the same way
  // ensureCurrentPerson below provisions its people row (#707 Phase 1).
  //
  // Both branches act only when the read actually succeeded. A failed one
  // also comes back with no tenants, and telling a legitimate member that they
  // were never added to an organization -- with nothing to do but sign out --
  // would turn a transient database error into a lockout.
  const tenantContext = await getTenantContext(supabase);
  if (tenantContext.resolved && tenantContext.tenants.length === 0) {
    return <NoTenant />;
  }

  // One host, one tenant (#956). Ordering is load-bearing in both directions:
  // NoTenant above explains "member of nothing" better than this can, and
  // ChooseTenant below would loop forever on a host whose tenant the account
  // is not in -- see decideHostTenant's own comment.
  const hostDecision = decideHostTenant(tenantContext);
  if (hostDecision.kind === "refuse") {
    return (
      <WrongOrganization
        hostTenantName={hostDecision.hostTenant.name}
        tenants={tenantContext.tenants}
      />
    );
  }
  if (hostDecision.kind === "align") {
    // The selection, not the host, is what current_tenant_id() answers from --
    // and it is what storage.objects' policies answer from too, which is why
    // the host is applied by writing it here rather than by teaching
    // current_tenant_id() to read the request header. PostgREST would follow
    // the header and storage-api, which never sees it, would not; a session
    // has to have one tenant, not two.
    const { error } = await supabase.rpc("set_current_tenant", {
      p_tenant_id: hostDecision.hostTenant.id,
    });
    // Only redirect on success. A failed write with a redirect is an infinite
    // loop, and this account is a member either way -- serving them the
    // portal they already had beats bouncing them forever over a blip.
    if (!error) {
      // Re-enter rather than re-read: a layout and the page beneath it render
      // in parallel, so the page's own queries can be in flight before the
      // write above lands. Only a fresh request guarantees the whole tree is
      // scoped to the tenant this host is for.
      const requestHeaders = await headers();
      redirect(safePortalDestination(requestHeaders.get(PORTAL_PATH_HEADER)));
    }
  }

  if (
    hostDecision.kind === "unenforced" &&
    tenantContext.resolved &&
    tenantContext.tenants.length > 1 &&
    tenantContext.currentTenantId === null
  ) {
    return <ChooseTenant tenants={tenantContext.tenants} />;
  }

  const permissions = await getCurrentUserPermissions(supabase);
  if (!Object.values(permissions).some((level) => level !== "none")) {
    redirect("/portal/login?error=no_access");
  }

  const canSeeExpenseApprovals = hasPermission(
    permissions,
    "finance_approvals",
    "manage",
  );
  const canSeeReimbursementApprovals = hasPermission(
    permissions,
    "reimbursement_approvals",
    "manage",
  );
  const canSeeVolunteerApplications = hasPermission(
    permissions,
    "volunteers",
    "view",
  );
  const canSeeContactMessages = hasPermission(
    permissions,
    "communications",
    "view",
  );
  const canSeeEventCheckins = hasPermission(permissions, "events", "view");
  const canSeeArtworkSubmissions = hasPermission(
    permissions,
    "artwork_submissions",
    "view",
  );
  const canSeeContentCalendar = hasPermission(
    permissions,
    "content_calendar",
    "view",
  );
  const canManageContentCalendar = hasPermission(
    permissions,
    "content_calendar",
    "manage",
  );
  const canSeeAccessManagement = hasPermission(
    permissions,
    "access_management_assets",
    "view",
  );

  // These reads are independent of each other, and this layout re-runs on
  // every portal navigation -- including every filter submit, which is a full
  // document navigation. Awaiting them one at a time put seven round trips on
  // the critical path of literally every interaction. Only the content-work
  // summary has a dependency (it needs the current person's id), so it chains
  // off that promise rather than forcing a second wave for everything.
  //
  // Also provisions a people row for this account on first sign-in: every
  // owner column in the portal references public.people, so a portal user
  // without one can't be assigned anything.
  const currentPersonPromise = ensureCurrentPerson(supabase);
  const [
    currentPerson,
    onboarding,
    pendingApprovals,
    opsInbox,
    contentWork,
    calendarCoverageReminder,
    accessManagementAlerts,
  ] = await Promise.all([
    currentPersonPromise,
    // Records this account's first arrival and tells us what it has already
    // been shown. No-ops after the first call.
    ensureMyOnboarding(supabase),
    canSeeExpenseApprovals || canSeeReimbursementApprovals
      ? getPendingApprovalsSummary(supabase, {
          canSeeExpenseApprovals,
          canSeeReimbursementApprovals,
        })
      : { items: [] },
    canSeeVolunteerApplications ||
    canSeeContactMessages ||
    canSeeEventCheckins ||
    canSeeArtworkSubmissions
      ? getOpsInboxSummary(supabase, {
          canSeeVolunteerApplications,
          canSeeContactMessages,
          canSeeEventCheckins,
          canSeeArtworkSubmissions,
        })
      : { items: [] },
    canSeeContentCalendar
      ? currentPersonPromise.then((person) =>
          getContentWorkSummary(supabase, {
            canSeeContentCalendar,
            personId: person?.person_id ?? null,
          }),
        )
      : { items: [] },
    getCalendarCoverageReminderSummary(supabase, { canManageContentCalendar }),
    getAccessManagementAttentionSummary(supabase, { canSeeAccessManagement }),
  ]);

  const welcomeOwed =
    onboarding !== null && onboarding.welcomeCompletedAt === null;
  // Release notes wait their turn: a brand-new user gets the introduction, not
  // a changelog. They also never show at all for a release with nothing to say
  // -- an empty or stale modal is worse than no modal.
  const whatsNewOwed =
    onboarding !== null &&
    !welcomeOwed &&
    RELEASE_NOTES.length > 0 &&
    (onboarding.lastReleaseSeen === null ||
      onboarding.lastReleaseSeen < CURRENT_RELEASE);

  const attentionItems = [
    ...pendingApprovals.items,
    ...contentWork.items,
    ...opsInbox.items,
    ...calendarCoverageReminder.items,
    ...accessManagementAlerts.items,
  ];

  // Same display rule as every other person in the portal, so a preferred
  // name set at /portal/account shows up here too.
  const displayName = personDisplayName(
    {
      preferred_name: currentPerson?.preferred_name,
      name:
        currentPerson?.name ??
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined),
      email: user.email,
    },
    user.email ?? "",
  );

  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";
  // Left undefined until the reader has actually toggled the quick-actions
  // group, so SidebarQuickActions can fall back to its own rule (#979) rather
  // than to a default that ignores how many actions the role even has.
  const quickActionsCookie = cookieStore.get("quick_actions_state")?.value;
  // One vocabulary for the whole shell: what this organization calls what it
  // lends (#896) and what it calls the people it works with (#911). The nav
  // tree, the command palette and the breadcrumbs all hold templates and none
  // of them should have to know which setting a word came from.
  const [branding, lexicon] = await Promise.all([
    getTenantBranding(supabase),
    getPortalVocabulary(supabase),
  ]);

  return (
    <TooltipProvider>
      {/* The tenant's palette, not just its logo. getTenantBranding()'s own
          comment has said "the outer portal layout applies it" since #707
          Phase 4, but only the logo was ever read here -- so a tenant's portal
          rendered in the stylesheet's colours while its public site rendered
          in its own. Harmless while the stylesheet's colours *were* Chatter
          Snow's; not once they are the platform's neutral default (#795 Phase
          3), which would leave every tenant a grey portal. */}
      <BrandStyle branding={branding} />
      <PortalHelpProvider>
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
                hostPinned={hostDecision.kind !== "unenforced"}
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
            {isDemoTenant(currentTenant(tenantContext)) && <DemoBanner />}
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
                  <LexiconProvider lexicon={lexicon}>
                    {children}
                  </LexiconProvider>
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
              <WelcomeDialog
                key="welcome"
                initialOpen
                permissions={permissions}
              />
            )}
            {whatsNewOwed && (
              <WhatsNewDialog key={CURRENT_RELEASE} initialOpen />
            )}
            {/* Mounted here because this shell is the one thing that doesn't
                remount on navigation, so the idle clock survives moving around
                the portal -- and because everything inside `(app)` is already
                past the signed-in guard above, which is what keeps the timeout
                off the login page and off every public route. */}
            <IdleTimeout />
            {/* One viewport for the whole portal: the sidebar quick actions
                save from every route, so the confirmation has to live above
                the page rather than inside it. */}
            <Toaster />
          </SidebarInset>
        </SidebarProvider>
      </PortalHelpProvider>
    </TooltipProvider>
  );
}
