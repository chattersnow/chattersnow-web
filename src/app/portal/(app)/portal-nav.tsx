"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutDashboard, Package, Receipt, Scale, Users } from "lucide-react";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { TabNavOverlay } from "./tab-nav-overlay";

const NAV_ITEMS = [
  { value: "overview", label: "Overview", href: "/portal/home", icon: LayoutDashboard },
  { value: "events", label: "Events", href: "/portal/events", icon: CalendarDays },
  { value: "inventory", label: "Inventory", href: "/portal/inventory", icon: Package },
  { value: "expenses", label: "Expenses", href: "/portal/expenses", icon: Receipt },
  { value: "people", label: "People", href: "/portal/people", icon: Users },
  { value: "governance", label: "Governance", href: "/portal/governance", icon: Scale },
] as const;

function activeItemFor(pathname: string) {
  if (pathname.startsWith("/portal/events")) return "events";
  if (pathname.startsWith("/portal/inventory")) return "inventory";
  if (pathname.startsWith("/portal/expenses")) return "expenses";
  if (pathname.startsWith("/portal/people")) return "people";
  if (pathname.startsWith("/portal/governance")) return "governance";
  return "overview";
}

export function PortalNav() {
  const pathname = usePathname();
  const active = activeItemFor(pathname);

  return (
    <SidebarMenu>
      {NAV_ITEMS.map((item) => (
        <SidebarMenuItem key={item.value}>
          <SidebarMenuButton
            isActive={active === item.value}
            tooltip={item.label}
            render={<Link href={item.href} />}
          >
            <item.icon />
            <span>{item.label}</span>
            <TabNavOverlay />
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
