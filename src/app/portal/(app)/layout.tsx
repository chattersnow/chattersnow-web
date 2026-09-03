import Image from "next/image";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { HelpButton } from "./help/help-button";
import { PortalHelpProvider } from "./help/help-context";
import { getContentWorkSummary } from "./home/queries";
import { ensureCurrentPerson } from "@/lib/auth/current-person";
import { personDisplayName } from "@/lib/format";
import { LogoutButton } from "./logout-button";
import { NotificationsMenu } from "./notifications-menu";
import { PortalNav } from "./portal-nav";
import { SidebarQuickActions } from "./sidebar-quick-actions";

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
    redirect("/portal/login");
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
  const pendingApprovals =
    canSeeExpenseApprovals || canSeeReimbursementApprovals
      ? await getPendingApprovalsSummary(supabase, {
          canSeeExpenseApprovals,
          canSeeReimbursementApprovals,
        })
      : { items: [] };

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
  const opsInbox =
    canSeeVolunteerApplications || canSeeContactMessages || canSeeEventCheckins
      ? await getOpsInboxSummary(supabase, {
          canSeeVolunteerApplications,
          canSeeContactMessages,
          canSeeEventCheckins,
        })
      : { items: [] };

  const canSeeContentCalendar = hasPermission(
    permissions,
    "content_calendar",
    "view",
  );
  // Also provisions a people row for this account on first sign-in: every
  // owner column in the portal references public.people, so a portal user
  // without one can't be assigned anything.
  const currentPerson = await ensureCurrentPerson(supabase);

  const contentWork = canSeeContentCalendar
    ? await getContentWorkSummary(supabase, {
        canSeeContentCalendar,
        personId: currentPerson?.person_id ?? null,
      })
    : { items: [] };

  const canManageContentCalendar = hasPermission(
    permissions,
    "content_calendar",
    "manage",
  );
  const calendarCoverageReminder = await getCalendarCoverageReminderSummary(
    supabase,
    { canManageContentCalendar },
  );

  const canSeeAccessManagement = hasPermission(
    permissions,
    "access_management_assets",
    "view",
  );
  const accessManagementAlerts = await getAccessManagementAttentionSummary(
    supabase,
    { canSeeAccessManagement },
  );

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

  return (
    <TooltipProvider>
      <PortalHelpProvider>
        <SidebarProvider defaultOpen={sidebarOpen}>
          <Sidebar collapsible="icon">
            <SidebarHeader>
              <Link
                href="/portal/home"
                className="flex min-w-0 items-center gap-2 px-2 py-1.5"
              >
                <Image
                  src="/chatter-logo-transparent.png"
                  alt="Chatter Snow"
                  width={32}
                  height={32}
                  className="size-8 shrink-0"
                  priority
                />
                <span className="app-muted min-w-0 truncate text-sm font-semibold uppercase tracking-[0.14em] group-data-[collapsible=icon]:hidden">
                  Chatter Snow
                </span>
              </Link>
            </SidebarHeader>
            <SidebarContent>
              <SidebarQuickActions
                permissions={permissions}
                currentPerson={currentPerson}
              />
              <PortalNav permissions={permissions} />
            </SidebarContent>
            <SidebarFooter>
              {/* Not in PortalNav: that list is permission-scoped module nav,
                  and every signed-in user has an account page. */}
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="My account"
                    render={<Link href="/portal/account" />}
                  >
                    <UserRound />
                    <span>My account</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
              <LogoutButton />
            </SidebarFooter>
          </Sidebar>
          <SidebarInset>
            <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--line)] bg-[var(--background)] px-6 py-4 sm:px-10">
              <SidebarTrigger />
              <Link href="/portal/home" className="flex items-center">
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
                <ThemeToggle className="size-10 rounded-full" />
                <HelpButton />
                <NotificationsMenu items={attentionItems} />
              </div>
            </header>
            <main className="app-shell px-6 py-8 sm:px-10">
              <div className="mx-auto max-w-6xl">{children}</div>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </PortalHelpProvider>
    </TooltipProvider>
  );
}
