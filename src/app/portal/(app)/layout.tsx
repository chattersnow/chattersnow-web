import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { getPendingApprovalsSummary } from "@/lib/portal/attention-items";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
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

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email ??
    null;

  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <TooltipProvider>
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
              <span className="app-muted min-w-0 truncate text-xs font-semibold uppercase tracking-[0.16em] group-data-[collapsible=icon]:hidden">
                Operations portal
              </span>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarQuickActions permissions={permissions} />
            <PortalNav permissions={permissions} />
          </SidebarContent>
          <SidebarFooter>
            <LogoutButton className="w-full justify-start group-data-[collapsible=icon]:justify-center" />
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="flex items-center gap-3 border-b border-[var(--line)] px-6 py-4 sm:px-10">
            <SidebarTrigger />
            <Link href="/portal/home" className="flex items-center gap-2">
              <Image
                src="/chatter-logo-transparent.png"
                alt="Chatter Snow"
                width={28}
                height={28}
                className="size-7"
              />
              <span className="app-muted hidden text-xs font-semibold uppercase tracking-[0.16em] sm:inline">
                Operations portal
              </span>
            </Link>
            <div className="ml-auto flex items-center gap-3">
              {displayName && (
                <span className="app-muted hidden max-w-40 truncate text-sm sm:inline">
                  Hi, {displayName}
                </span>
              )}
              <NotificationsMenu items={pendingApprovals.items} />
            </div>
          </header>
          <main className="app-shell flex-1 px-6 py-8 sm:px-10">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
