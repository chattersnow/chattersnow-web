"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CalendarRange,
  ChevronRight,
  HandCoins,
  Handshake,
  HandHeart,
  Landmark,
  LayoutDashboard,
  Layers,
  Mail,
  Package,
  Scale,
  ShieldCheck,
  Ticket,
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
import { type PermissionMap } from "@/lib/auth/permissions";
import {
  activeSectionFor,
  activeSubItemFor,
  visibleNavItems,
} from "@/lib/portal/nav";

/**
 * Icons live here rather than in the shared nav tree: they're a rendering
 * concern, and keeping them out lets the section index routes import the tree
 * on the server without an icon library coming with it.
 */
const SECTION_ICONS: Record<string, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  events: CalendarDays,
  calendar: CalendarRange,
  programs: Layers,
  inventory: Package,
  volunteers: HandHeart,
  messages: Mail,
  finance: Landmark,
  people: Users,
  donors: HandCoins,
  sponsors: Handshake,
  attendees: Ticket,
  governance: Scale,
  administration: ShieldCheck,
};

export function PortalNav({ permissions }: { permissions: PermissionMap }) {
  const pathname = usePathname();
  const { state: sidebarState } = useSidebar();
  const activeSection = activeSectionFor(pathname) ?? null;

  const [openSection, setOpenSection] = useState<string | null>(activeSection);
  const [syncedSection, setSyncedSection] = useState(activeSection);

  if (activeSection !== syncedSection) {
    setSyncedSection(activeSection);
    setOpenSection(activeSection);
  }

  function toggleSection(value: string) {
    setOpenSection((prev) => (prev === value ? null : value));
  }

  const visibleItems = visibleNavItems(permissions);

  return (
    <SidebarMenu>
      {visibleItems.map((item) => {
        const isSectionActive = activeSection === item.value;
        const isOpen = Boolean(item.subItems && openSection === item.value);
        const activeSub = isSectionActive
          ? activeSubItemFor(pathname, item)
          : undefined;
        const Icon = SECTION_ICONS[item.value] ?? LayoutDashboard;
        const submenuId = `nav-section-${item.value}`;
        // Collapsed to icons there is nowhere to put a sub-list, so a section
        // is a link to its first reachable page. Rendering it as a link rather
        // than a button that quietly navigates means the control always looks
        // like what it does -- it used to be the same button either way, and
        // which behaviour you got depended on a sidebar mode you may not have
        // set deliberately.
        const isLink = !item.subItems || sidebarState === "collapsed";

        return (
          <SidebarMenuItem key={item.value}>
            {!isLink ? (
              <SidebarMenuButton
                isActive={isSectionActive}
                tooltip={item.label}
                aria-expanded={isOpen}
                aria-controls={isOpen ? submenuId : undefined}
                onClick={() => toggleSection(item.value)}
              >
                <Icon />
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
                <Icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            )}

            {item.subItems && isOpen && !isLink ? (
              <SidebarMenuSub id={submenuId}>
                {item.subItems.map((sub) => (
                  <SidebarMenuSubItem key={sub.value}>
                    <SidebarMenuSubButton
                      isActive={activeSub === sub.value}
                      render={<Link href={sub.href} />}
                    >
                      <span>{sub.label}</span>
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
