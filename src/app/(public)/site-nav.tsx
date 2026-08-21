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

const HOME_LINK = { label: "Home", href: "/home" } as const;

const ABOUT_LINKS = [
  { label: "Our Mission", href: "/about" },
  { label: "Meet the Team", href: "/about/team" },
  { label: "Programs", href: "/about/programs" },
  { label: "Volunteer", href: "/about/volunteer" },
  { label: "Donate", href: "/about/donations" },
] as const;

const TRAILING_LINKS = [
  { label: "Events", href: "/events" },
  { label: "Gears", href: "/gears" },
  { label: "Contact Us", href: "/contact" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home";
  return pathname === href || pathname.startsWith(`${href}/`);
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
  const aboutActive = pathname.startsWith("/about");
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      <nav className="hidden sm:block">
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink
                render={<Link href={HOME_LINK.href} />}
                active={isActive(pathname, HOME_LINK.href)}
              >
                {HOME_LINK.label}
              </NavigationMenuLink>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuTrigger data-active={aboutActive || undefined}>
                About Us
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-48 gap-1">
                  {ABOUT_LINKS.map((link) => (
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

            {TRAILING_LINKS.map((link) => (
              <NavigationMenuItem key={link.href}>
                <NavigationMenuLink
                  render={<Link href={link.href} />}
                  active={isActive(pathname, link.href)}
                >
                  {link.label}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
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
            <MobileNavLink href={HOME_LINK.href} onNavigate={closeMobile}>
              {HOME_LINK.label}
            </MobileNavLink>

            <p className="app-eyebrow px-2 pt-4">About us</p>
            {ABOUT_LINKS.map((link) => (
              <MobileNavLink key={link.href} href={link.href} onNavigate={closeMobile}>
                {link.label}
              </MobileNavLink>
            ))}

            <div className="mt-2 flex flex-col gap-1 border-t border-[var(--line)] pt-3">
              {TRAILING_LINKS.map((link) => (
                <MobileNavLink key={link.href} href={link.href} onNavigate={closeMobile}>
                  {link.label}
                </MobileNavLink>
              ))}
            </div>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
