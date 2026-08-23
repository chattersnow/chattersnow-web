import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRoles } from "@/lib/auth/roles";
import { getCurrentUserPermissions } from "@/lib/auth/permissions";
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
import { PortalNav } from "./portal-nav";
import { SidebarQuickActions } from "./sidebar-quick-actions";

export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/login");
  }

  const roles = await getCurrentUserRoles(supabase);
  if (roles.length === 0) {
    redirect("/portal/login?error=no_access");
  }
  const permissions = await getCurrentUserPermissions(supabase);

  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <Link href="/portal/home" className="flex min-w-0 items-center gap-2 px-2 py-1.5">
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
            <Link href="/portal/home" className="flex items-center gap-2 md:hidden">
              <Image
                src="/chatter-logo-transparent.png"
                alt="Chatter Snow"
                width={28}
                height={28}
                className="size-7"
              />
              <span className="app-muted text-xs font-semibold uppercase tracking-[0.16em]">
                Operations portal
              </span>
            </Link>
          </header>
          <main className="app-shell flex-1 px-6 py-8 sm:px-10">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
