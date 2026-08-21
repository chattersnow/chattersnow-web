"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronRight,
  HandHeart,
  Landmark,
  LayoutDashboard,
  Package,
  Scale,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { TabNavOverlay } from "./tab-nav-overlay";

type NavSubItem = {
  value: string;
  label: string;
  href: string;
};

type NavItem = {
  value: string;
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  basePath?: string;
  subItems?: readonly NavSubItem[];
};

const NAV_ITEMS: readonly NavItem[] = [
  { value: "overview", label: "Overview", href: "/portal/home", icon: LayoutDashboard },
  { value: "events", label: "Events", href: "/portal/events", icon: CalendarDays },
  {
    value: "inventory",
    label: "Inventory",
    href: "/portal/inventory/items",
    icon: Package,
    basePath: "/portal/inventory",
    subItems: [
      { value: "items", label: "Items", href: "/portal/inventory/items" },
      { value: "donations", label: "Donations", href: "/portal/inventory/donations" },
      { value: "distribution", label: "Distribution", href: "/portal/inventory/distribution" },
      { value: "reports", label: "Inventory Reports", href: "/portal/inventory/reports" },
    ],
  },
  {
    value: "volunteers",
    label: "Volunteers",
    href: "/portal/volunteers/roles",
    icon: HandHeart,
    basePath: "/portal/volunteers",
    subItems: [
      { value: "roles", label: "Roles", href: "/portal/volunteers/roles" },
      { value: "participation", label: "Participation", href: "/portal/volunteers/participation" },
    ],
  },
  {
    value: "finance",
    label: "Finance",
    href: "/portal/finance/expenses",
    icon: Landmark,
    basePath: "/portal/finance",
    subItems: [
      { value: "expenses", label: "Expenses", href: "/portal/finance/expenses" },
      { value: "donations", label: "Donations", href: "/portal/finance/donations" },
      { value: "reimbursements", label: "Reimbursements", href: "/portal/finance/reimbursements" },
      { value: "reports", label: "Financial Reports", href: "/portal/finance/reports" },
    ],
  },
  { value: "people", label: "People", href: "/portal/people", icon: Users },
  {
    value: "governance",
    label: "Governance",
    href: "/portal/governance/board-members",
    icon: Scale,
    basePath: "/portal/governance",
    subItems: [
      { value: "board-members", label: "Board Members", href: "/portal/governance/board-members" },
      { value: "meetings", label: "Meetings", href: "/portal/governance/meetings" },
      { value: "bylaws", label: "Bylaws", href: "/portal/governance/bylaws" },
      { value: "policies", label: "Policies", href: "/portal/governance/policies" },
      {
        value: "conflict-of-interest",
        label: "Conflict of Interest",
        href: "/portal/governance/conflict-of-interest",
      },
      {
        value: "annual-requirements",
        label: "Annual Requirements",
        href: "/portal/governance/annual-requirements",
      },
    ],
  },
  {
    value: "administration",
    label: "Administration",
    href: "/portal/administration/users",
    icon: ShieldCheck,
    basePath: "/portal/administration",
    subItems: [
      { value: "users", label: "Users", href: "/portal/administration/users" },
      { value: "permissions", label: "Permissions", href: "/portal/administration/permissions" },
      {
        value: "system-settings",
        label: "System Settings",
        href: "/portal/administration/system-settings",
      },
      { value: "audit-log", label: "Audit Log", href: "/portal/administration/audit-log" },
    ],
  },
] as const;

function activeSectionFor(pathname: string): string {
  for (const item of NAV_ITEMS) {
    const testPath = item.basePath ?? item.href;
    if (pathname === testPath || pathname.startsWith(`${testPath}/`)) {
      return item.value;
    }
  }
  return "overview";
}

function activeSubItemFor(pathname: string, item: NavItem): string | undefined {
  if (!item.subItems) return undefined;
  let best: NavSubItem | undefined;
  for (const sub of item.subItems) {
    if (pathname === sub.href || pathname.startsWith(`${sub.href}/`)) {
      if (!best || sub.href.length > best.href.length) best = sub;
    }
  }
  return best?.value;
}

export function PortalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { state: sidebarState } = useSidebar();
  const activeSection = activeSectionFor(pathname);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => ({
    [activeSection]: true,
  }));
  const [syncedSection, setSyncedSection] = useState(activeSection);

  if (activeSection !== syncedSection) {
    setSyncedSection(activeSection);
    setOpenSections((prev) => ({ ...prev, [activeSection]: true }));
  }

  function toggleSection(value: string) {
    setOpenSections((prev) => ({ ...prev, [value]: !prev[value] }));
  }

  return (
    <SidebarMenu>
      {NAV_ITEMS.map((item) => {
        const isSectionActive = activeSection === item.value;
        const isOpen = Boolean(item.subItems && openSections[item.value]);
        const activeSub = isSectionActive ? activeSubItemFor(pathname, item) : undefined;

        return (
          <SidebarMenuItem key={item.value}>
            {item.subItems ? (
              <SidebarMenuButton
                isActive={isSectionActive}
                tooltip={item.label}
                onClick={() => {
                  if (sidebarState === "collapsed") {
                    router.push(item.href);
                    return;
                  }
                  toggleSection(item.value);
                }}
              >
                <item.icon />
                <span>{item.label}</span>
                <ChevronRight
                  className={cn(
                    "ml-auto transition-transform",
                    isOpen && "rotate-90"
                  )}
                />
              </SidebarMenuButton>
            ) : (
              <SidebarMenuButton
                isActive={isSectionActive}
                tooltip={item.label}
                render={<Link href={item.href} />}
              >
                <item.icon />
                <span>{item.label}</span>
                <TabNavOverlay />
              </SidebarMenuButton>
            )}

            {item.subItems && isOpen ? (
              <SidebarMenuSub>
                {item.subItems.map((sub) => (
                  <SidebarMenuSubItem key={sub.value}>
                    <SidebarMenuSubButton
                      isActive={activeSub === sub.value}
                      render={<Link href={sub.href} />}
                    >
                      <span>{sub.label}</span>
                      <TabNavOverlay />
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            ) : null}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
