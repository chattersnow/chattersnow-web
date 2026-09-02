"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// `slot` ties a group (or an individual link within a group) to an entry in
// PUBLIC_PAGE_SLOTS, so a section the board has hidden from Administration >
// System Settings drops out of the nav. A group with no slot -- Home -- is
// always shown; a group whose links are all hidden is dropped entirely.
type NavLink = { label: string; href: string; slot?: string };
type NavGroup =
  | { label: string; href: string; slot?: string; links?: undefined }
  | {
      label: string;
      href?: undefined;
      slot?: string;
      links: readonly NavLink[];
    };

const NAV_GROUPS: readonly NavGroup[] = [
  { label: "Home", href: "/home" },
  {
    label: "About",
    slot: "about",
    links: [
      { label: "Our Story", href: "/about/story" },
      { label: "Mission & Values", href: "/about/mission" },
      { label: "Meet the Team", href: "/about/team" },
    ],
  },
  {
    label: "Events",
    slot: "events",
    links: [
      { label: "All Events", href: "/events" },
      { label: "Community Calendar", href: "/events/community" },
    ],
  },
  { label: "Programs", href: "/programs", slot: "programs" },
  { label: "Learn", href: "/learn", slot: "learn" },
  {
    label: "Gear",
    slot: "gears",
    links: [
      { label: "Gear Library", href: "/gears/library" },
      { label: "Sizing Guide", href: "/gears/sizing" },
      { label: "How It Works", href: "/gears/donate#how-it-works" },
      { label: "Request Gear", href: "/gears/donate#request" },
      { label: "Donate Gear", href: "/gears/donate#donate" },
      { label: "Gear Drives", href: "/gears/donate#gear-drives" },
    ],
  },
  {
    label: "Get Involved",
    slot: "get-involved",
    links: [
      { label: "Attend", href: "/get-involved/attend" },
      { label: "Volunteer", href: "/get-involved/volunteer" },
      { label: "Become a Partner", href: "/get-involved/partner" },
    ],
  },
  {
    label: "Support",
    slot: "support",
    links: [
      { label: "Donations", href: "/support/donations" },
      { label: "Sponsorship", href: "/support/sponsorship" },
    ],
  },
  { label: "Contact", href: "/contact", slot: "contact" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isGroupActive(pathname: string, group: NavGroup) {
  if (!group.links) return isActive(pathname, group.href);
  return group.links.some((link) => isActive(pathname, link.href));
}

function MobileNavLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="rounded-lg px-2 py-2 text-sm font-medium hover:bg-muted"
    >
      {children}
    </Link>
  );
}

function MobileSubNavLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="rounded-lg py-1.5 pl-6 pr-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </Link>
  );
}

/**
 * Drops every group and sub-link belonging to a hidden section. A group is
 * removed when its own slot is hidden, and also when filtering its sub-links
 * leaves it empty -- otherwise the board hiding the last page in a group would
 * leave an empty dropdown behind.
 */
function visibleGroups(hidden: readonly string[]): NavGroup[] {
  const isHidden = (slot?: string) => Boolean(slot && hidden.includes(slot));

  return NAV_GROUPS.filter((group) => !isHidden(group.slot))
    .map((group) => {
      if (!group.links) return group;
      const links = group.links.filter((link) => !isHidden(link.slot));
      return { ...group, links };
    })
    .filter((group) => group.links === undefined || group.links.length > 0);
}

export function SiteNav({
  hiddenSlots = [],
}: {
  hiddenSlots?: readonly string[];
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);
  const groups = visibleGroups(hiddenSlots);

  return (
    <>
      <nav className="hidden sm:block">
        <NavigationMenu>
          <NavigationMenuList>
            {groups.map((group) =>
              !group.links ? (
                <NavigationMenuItem key={group.label}>
                  <NavigationMenuLink
                    className="rainbow-underline"
                    render={<Link href={group.href} />}
                    active={isActive(pathname, group.href)}
                  >
                    {group.label}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ) : (
                <NavigationMenuItem key={group.label}>
                  <NavigationMenuTrigger
                    className="rainbow-underline"
                    data-active={isGroupActive(pathname, group) || undefined}
                  >
                    {group.label}
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-48 gap-1">
                      {group.links.map((link) => (
                        <li key={link.href}>
                          <NavigationMenuLink
                            render={<Link href={link.href} />}
                            active={pathname === link.href}
                            closeOnClick
                          >
                            {link.label}
                          </NavigationMenuLink>
                        </li>
                      ))}
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              ),
            )}
          </NavigationMenuList>
        </NavigationMenu>
      </nav>

      <ThemeToggle />

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon" className="size-11 sm:hidden" />
          }
        >
          <MenuIcon />
          <span className="sr-only">Open menu</span>
        </SheetTrigger>
        <SheetContent side="right" size="sm">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
            {groups.map((group) =>
              !group.links ? (
                <MobileNavLink
                  key={group.label}
                  href={group.href}
                  onNavigate={closeMobile}
                >
                  {group.label}
                </MobileNavLink>
              ) : (
                <div key={group.label} className="flex flex-col gap-0.5">
                  <p className="app-eyebrow px-2">{group.label}</p>
                  {group.links.map((link) => (
                    <MobileSubNavLink
                      key={link.href}
                      href={link.href}
                      onNavigate={closeMobile}
                    >
                      {link.label}
                    </MobileSubNavLink>
                  ))}
                </div>
              ),
            )}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
