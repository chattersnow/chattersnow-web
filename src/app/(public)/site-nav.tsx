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
      { label: "Our Story", href: "/about" },
      { label: "Meet the Team", href: "/about/team" },
    ],
  },
  { label: "Events", href: "/events" },
  { label: "Programs", href: "/programs" },
  { label: "Gear", href: "/gears" },
  { label: "Get Involved", href: "/get-involved" },
  { label: "Support", href: "/support" },
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
              )
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
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 px-4 pb-4">
            {NAV_GROUPS.map((group) =>
              !group.links ? (
                <MobileNavLink key={group.label} href={group.href} onNavigate={closeMobile}>
                  {group.label}
                </MobileNavLink>
              ) : (
                <div key={group.label} className="flex flex-col gap-1">
                  <p className="app-eyebrow px-2 pt-4">{group.label}</p>
                  {group.links.map((link) => (
                    <MobileNavLink key={link.href} href={link.href} onNavigate={closeMobile}>
                      {link.label}
                    </MobileNavLink>
                  ))}
                </div>
              )
            )}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
