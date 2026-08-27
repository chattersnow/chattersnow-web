"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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

type NavLink = { label: string; href: string };
type NavGroup =
  | { label: string; href: string; links?: undefined }
  | { label: string; href?: undefined; links: readonly NavLink[] };

const NAV_GROUPS: readonly NavGroup[] = [
  { label: "Home", href: "/home" },
  {
    label: "About",
    links: [
      { label: "Our Story", href: "/about/story" },
      { label: "Mission & Values", href: "/about/mission" },
      { label: "Meet the Team", href: "/about/team" },
    ],
  },
  {
    label: "Events",
    links: [
      { label: "All Events", href: "/events" },
      { label: "Community Calendar", href: "/events/community" },
    ],
  },
  { label: "Programs", href: "/programs" },
  { label: "Learn", href: "/learn" },
  {
    label: "Gear",
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
    links: [
      { label: "Attend", href: "/get-involved/attend" },
      { label: "Volunteer", href: "/get-involved/volunteer" },
      { label: "Become a Partner", href: "/get-involved/partner" },
    ],
  },
  {
    label: "Support",
    links: [
      { label: "Donations", href: "/support/donations" },
      { label: "Sponsorship", href: "/support/sponsorship" },
    ],
  },
  { label: "Contact", href: "/contact" },
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

export function SiteNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      <nav className="hidden sm:block">
        <NavigationMenu>
          <NavigationMenuList>
            {NAV_GROUPS.map((group) =>
              !group.links ? (
                <NavigationMenuItem key={group.label}>
                  <NavigationMenuLink
                    render={<Link href={group.href} />}
                    active={isActive(pathname, group.href)}
                  >
                    {group.label}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ) : (
                <NavigationMenuItem key={group.label}>
                  <NavigationMenuTrigger
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

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger
          render={<Button variant="ghost" size="icon" className="sm:hidden" />}
        >
          <MenuIcon />
          <span className="sr-only">Open menu</span>
        </SheetTrigger>
        <SheetContent side="right" size="sm">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
            {NAV_GROUPS.map((group) =>
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
