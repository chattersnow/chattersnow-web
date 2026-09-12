"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toPortalPathname } from "@/lib/portal/paths";
import {
  CalendarDays,
  CalendarRange,
  ChevronRight,
  HandCoins,
  HandHeart,
  Handshake,
  Landmark,
  Layers,
  LayoutDashboard,
  Mail,
  Package,
  Palette,
  Scale,
  Server,
  ShieldCheck,
  Ticket,
  Users,
} from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarSeparator,
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
  navGroups,
  visibleNavItems,
} from "@/lib/portal/nav";
import { type Lexicon } from "@/lib/lexicon";
import { DEFAULT_VOCABULARY } from "@/lib/person-roles";

/**
 * Icons live here rather than in the shared nav tree: they're a rendering
 * concern, and keeping them out lets the section index routes import the tree
 * on the server without an icon library coming with it.
 */
const SECTION_ICONS: Record<string, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  events: CalendarDays,
  artwork: Palette,
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
  technology: Server,
  administration: ShieldCheck,
};

export function PortalNav({
  permissions,
  lexicon = DEFAULT_VOCABULARY,
}: {
  permissions: PermissionMap;
  /** This tenant's words for the sections it names itself (#896). */
  lexicon?: Lexicon;
}) {
  // The portal host serves prefix-free URLs; nav hrefs are canonical
  // `/portal/...` paths, so normalize before matching.
  const pathname = toPortalPathname(usePathname());
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

  const visibleItems = visibleNavItems(permissions, lexicon);

  // One SidebarGroup per heading rather than one SidebarMenu for everything:
  // SidebarGroupLabel already folds itself away in the icon rail
  // (`group-data-[collapsible=icon]` drops its height and opacity), so the
  // collapsed sidebar stays a plain column of icons with no special casing
  // here. A separator keeps the grouping legible there, where the words are
  // gone.
  return navGroups(visibleItems).map((group, index) => (
    <SidebarGroup key={group.label ?? "ungrouped"} className="py-1">
      {group.label ? (
        <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      ) : null}
      {index > 0 ? (
        <SidebarSeparator className="mx-2 hidden group-data-[collapsible=icon]:block" />
      ) : null}
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => {
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
                    {navGroups(item.subItems).map((group) => {
                      const items = group.items.map((sub) => (
                        <SidebarMenuSubItem key={sub.value}>
                          <SidebarMenuSubButton
                            isActive={activeSub === sub.value}
                            render={<Link href={sub.href} />}
                          >
                            <span>{sub.label}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ));
                      if (!group.label) return items;
                      // `aria-labelledby` on the nested list, deliberately NOT
                      // `role="group"`: that role replaces the ul's implicit
                      // `list` role, which orphans every li inside it and fails
                      // axe's `listitem` rule. A named list announces
                      // "Oversight, list, 2 items", which is what was wanted
                      // anyway.
                      //
                      // The heading is a div, never a button -- it is not a
                      // focus stop, and the tab path through the sidebar is
                      // already long. Keyed off the first item's value rather
                      // than a slug of the label: it is already unique and
                      // already kebab-case.
                      const headingId = `${submenuId}-group-${group.items[0].value}`;
                      return (
                        <li key={group.label} className="mt-2 first:mt-0">
                          <div
                            id={headingId}
                            className="px-2 py-1 text-xs font-medium tracking-wide text-sidebar-foreground/70 uppercase"
                          >
                            {group.label}
                          </div>
                          <ul
                            aria-labelledby={headingId}
                            className="flex min-w-0 flex-col gap-1"
                          >
                            {items}
                          </ul>
                        </li>
                      );
                    })}
                  </SidebarMenuSub>
                ) : null}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}
