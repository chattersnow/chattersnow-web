"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toPortalPathname } from "@/lib/portal/paths";
import {
  Building2,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  Globe,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  platform: Building2,
  website: Globe,
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

  // The section owning the current route is open on the very first render, so
  // Base UI treats it as already-open and emits no enter transition -- which
  // means the transitionend handler below never fires for it. Without this, a
  // hard reload onto a page in a section near the bottom of a long nav lands
  // with that section's sub-items off-screen, which is the state this change
  // exists to prevent. Instant rather than smooth: nothing has moved yet, so
  // there is no motion to explain.
  const openPanelRef = useRef<HTMLDivElement | null>(null);
  const didInitialScroll = useRef(false);

  useEffect(() => {
    if (didInitialScroll.current) return;
    didInitialScroll.current = true;
    openPanelRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "instant",
    });
  }, []);

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
            const sectionId = `nav-section-${item.value}`;
            // Collapsed to icons there is nowhere to put a sub-list, so a section
            // is a link to its first reachable page. Rendering it as a link rather
            // than a button that quietly navigates means the control always looks
            // like what it does -- it used to be the same button either way, and
            // which behaviour you got depended on a sidebar mode you may not have
            // set deliberately.
            const isLink = !item.subItems || sidebarState === "collapsed";

            return (
              <SidebarMenuItem key={item.value}>
                {item.subItems && !isLink ? (
                  // `aria-expanded`/`aria-controls` are deliberately gone: the
                  // Base UI trigger emits exactly the same pair, including the
                  // `open ? panelId : undefined` guard that keeps `aria-controls`
                  // from pointing at an unmounted panel.
                  <Collapsible
                    open={isOpen}
                    onOpenChange={() => toggleSection(item.value)}
                  >
                    <SidebarMenuButton
                      isActive={isSectionActive}
                      tooltip={item.label}
                      render={<CollapsibleTrigger />}
                      // Pinned only while this section is open, so a long list
                      // like Administration's keeps saying which section you are
                      // reading. `bg-sidebar` is not optional -- the rail's
                      // background is painted further up, so without it the items
                      // being scrolled show straight through the header. The
                      // sticky box is bounded by the Collapsible, so it releases
                      // as soon as its own sub-items have scrolled past.
                      className={cn(isOpen && "sticky top-0 z-10 bg-sidebar")}
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
                    <CollapsibleContent
                      ref={openPanelRef}
                      // Clears the sticky header above, which is one h-8 button.
                      className="scroll-mt-8"
                      // On transitionend rather than in an effect: at the moment
                      // the state flips the panel is still at height 0, so
                      // anything measuring then scrolls to the wrong offset.
                      // No explicit `behavior`, so the container's `scroll-smooth`
                      // decides and the global prefers-reduced-motion rule can
                      // force it back to `auto`; that rule collapses durations to
                      // 0.01ms rather than removing them, so this still fires.
                      onTransitionEnd={(event) => {
                        if (
                          event.target !== event.currentTarget ||
                          event.propertyName !== "height" ||
                          !isOpen
                        ) {
                          return;
                        }
                        event.currentTarget.scrollIntoView({
                          block: "nearest",
                        });
                      }}
                    >
                      <SidebarMenuSub>
                        {navGroups(item.subItems).map((group, groupIndex) => {
                          const items = group.items.map((sub, subIndex) => (
                            <SidebarMenuSubItem
                              key={sub.value}
                              // A labelled group gets its gap from the wrapper
                              // below; an ungrouped run following one has no
                              // wrapper to hang it on, so the first of its items
                              // carries the same mt-2. Without it Finance's
                              // ungrouped Financial Reports sat flush under
                              // Products and read as a fourth Sales page (#988).
                              className={
                                !group.label && groupIndex > 0 && subIndex === 0
                                  ? "mt-2"
                                  : undefined
                              }
                            >
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
                          const headingId = `${sectionId}-group-${group.items[0].value}`;
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
                    </CollapsibleContent>
                  </Collapsible>
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
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}
