"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  CalendarRange,
  ChevronRight,
  HandHeart,
  Landmark,
  LayoutDashboard,
  Layers,
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
import {
  hasAnyPermission,
  type PermissionCheck,
  type PermissionMap,
} from "@/lib/auth/permissions";

type NavSubItem = {
  value: string;
  label: string;
  href: string;
  access: readonly PermissionCheck[];
};

type NavItem = {
  value: string;
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  basePath?: string;
  /** Omit for items always visible regardless of permissions (e.g. Overview). */
  access?: readonly PermissionCheck[];
  subItems?: readonly NavSubItem[];
};

const NAV_ITEMS: readonly NavItem[] = [
  {
    value: "overview",
    label: "Overview",
    href: "/portal/home",
    icon: LayoutDashboard,
  },
  {
    value: "events",
    label: "Events",
    href: "/portal/events",
    icon: CalendarDays,
    access: [{ resource: "events", level: "view" }],
  },
  {
    value: "calendar",
    label: "Calendar",
    href: "/portal/calendar",
    icon: CalendarRange,
    basePath: "/portal/calendar",
    subItems: [
      {
        value: "items",
        label: "Calendar",
        href: "/portal/calendar",
        access: [{ resource: "content_calendar", level: "view" }],
      },
      {
        value: "work-queue",
        label: "Work queue",
        href: "/portal/calendar/work-queue",
        access: [{ resource: "content_calendar", level: "view" }],
      },
      {
        value: "templates",
        label: "Brief templates",
        href: "/portal/calendar/templates",
        access: [{ resource: "content_calendar", level: "manage" }],
      },
    ],
  },
  {
    value: "programs",
    label: "Programs",
    href: "/portal/programs",
    icon: Layers,
    access: [{ resource: "programs", level: "view" }],
  },
  {
    value: "inventory",
    label: "Inventory",
    href: "/portal/inventory/items",
    icon: Package,
    basePath: "/portal/inventory",
    subItems: [
      {
        value: "items",
        label: "Items",
        href: "/portal/inventory/items",
        access: [{ resource: "inventory", level: "view" }],
      },
      {
        value: "donations",
        label: "Donations",
        href: "/portal/inventory/donations",
        access: [
          { resource: "inventory", level: "view" },
          { resource: "inventory_intake", level: "manage" },
        ],
      },
      {
        value: "distribution",
        label: "Distribution",
        href: "/portal/inventory/distribution",
        access: [
          { resource: "inventory", level: "view" },
          { resource: "inventory_intake", level: "manage" },
        ],
      },
      {
        value: "reports",
        label: "Inventory Reports",
        href: "/portal/inventory/reports",
        access: [{ resource: "inventory_reports", level: "view" }],
      },
    ],
  },
  {
    value: "volunteers",
    label: "Volunteers",
    href: "/portal/volunteers/roles",
    icon: HandHeart,
    basePath: "/portal/volunteers",
    subItems: [
      {
        value: "roles",
        label: "Roles",
        href: "/portal/volunteers/roles",
        access: [{ resource: "volunteers", level: "view" }],
      },
      {
        value: "participation",
        label: "Participation",
        href: "/portal/volunteers/participation",
        access: [{ resource: "volunteers", level: "view" }],
      },
    ],
  },
  {
    value: "finance",
    label: "Finance",
    href: "/portal/finance/expenses",
    icon: Landmark,
    basePath: "/portal/finance",
    subItems: [
      {
        value: "expenses",
        label: "Expenses",
        href: "/portal/finance/expenses",
        access: [
          { resource: "finance", level: "manage" },
          { resource: "finance_approvals", level: "manage" },
        ],
      },
      {
        value: "revenue",
        label: "Revenue",
        href: "/portal/finance/revenue",
        access: [{ resource: "finance", level: "manage" }],
      },
      {
        value: "donations",
        label: "Donations",
        href: "/portal/finance/donations",
        access: [{ resource: "finance", level: "manage" }],
      },
      {
        value: "reimbursements",
        label: "Reimbursements",
        href: "/portal/finance/reimbursements",
        access: [{ resource: "finance", level: "manage" }],
      },
      {
        value: "reports",
        label: "Financial Reports",
        href: "/portal/finance/reports",
        access: [{ resource: "finance_reports", level: "view" }],
      },
    ],
  },
  {
    value: "people",
    label: "People",
    href: "/portal/people",
    icon: Users,
    access: [{ resource: "people", level: "view" }],
  },
  {
    value: "governance",
    label: "Governance",
    href: "/portal/governance/board-members",
    icon: Scale,
    basePath: "/portal/governance",
    subItems: [
      {
        value: "board-members",
        label: "Board Members",
        href: "/portal/governance/board-members",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "meetings",
        label: "Meetings",
        href: "/portal/governance/meetings",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "bylaws",
        label: "Bylaws",
        href: "/portal/governance/bylaws",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "policies",
        label: "Policies",
        href: "/portal/governance/policies",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "conflict-of-interest",
        label: "Conflict of Interest",
        href: "/portal/governance/conflict-of-interest",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "annual-requirements",
        label: "Annual Requirements",
        href: "/portal/governance/annual-requirements",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "nonprofit-status",
        label: "Nonprofit Status",
        href: "/portal/governance/nonprofit-status",
        access: [{ resource: "governance", level: "manage" }],
      },
      {
        value: "resolutions",
        label: "Resolutions",
        href: "/portal/governance/resolutions",
        access: [{ resource: "governance", level: "manage" }],
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
      {
        value: "users",
        label: "Users",
        href: "/portal/administration/users",
        access: [{ resource: "administration", level: "manage" }],
      },
      {
        value: "roles",
        label: "Roles",
        href: "/portal/administration/roles",
        access: [{ resource: "administration", level: "manage" }],
      },
      {
        value: "permissions",
        label: "Permissions",
        href: "/portal/administration/permissions",
        access: [{ resource: "administration", level: "manage" }],
      },
      {
        value: "system-settings",
        label: "System Settings",
        href: "/portal/administration/system-settings",
        access: [
          { resource: "administration", level: "manage" },
          { resource: "system_settings", level: "manage" },
        ],
      },
      {
        value: "audit-log",
        label: "Audit Log",
        href: "/portal/administration/audit-log",
        access: [{ resource: "administration", level: "manage" }],
      },
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

export function PortalNav({ permissions }: { permissions: PermissionMap }) {
  const pathname = usePathname();
  const router = useRouter();
  const { state: sidebarState } = useSidebar();
  const activeSection = activeSectionFor(pathname);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => ({
      [activeSection]: true,
    }),
  );
  const [syncedSection, setSyncedSection] = useState(activeSection);

  if (activeSection !== syncedSection) {
    setSyncedSection(activeSection);
    setOpenSections((prev) => ({ ...prev, [activeSection]: true }));
  }

  function toggleSection(value: string) {
    setOpenSections((prev) => ({ ...prev, [value]: !prev[value] }));
  }

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.subItems)
      return item.subItems.some((sub) =>
        hasAnyPermission(permissions, sub.access),
      );
    return !item.access || hasAnyPermission(permissions, item.access);
  }).map((item) => {
    const subItems = item.subItems?.filter((sub) =>
      hasAnyPermission(permissions, sub.access),
    );
    const href =
      subItems &&
      subItems.length > 0 &&
      !subItems.some((s) => s.href === item.href)
        ? subItems[0].href
        : item.href;
    return {
      ...item,
      href,
      subItems: subItems && subItems.length > 0 ? subItems : undefined,
    };
  });

  return (
    <SidebarMenu>
      {visibleItems.map((item) => {
        const isSectionActive = activeSection === item.value;
        const isOpen = Boolean(item.subItems && openSections[item.value]);
        const activeSub = isSectionActive
          ? activeSubItemFor(pathname, item)
          : undefined;

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
                    isOpen && "rotate-90",
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
