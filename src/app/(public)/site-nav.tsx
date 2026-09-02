"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { type NavGroup, isSlotVisible, visibleGroups } from "@/lib/public-nav";
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

/**
 * Shared box for the top-level items so a plain link and a dropdown trigger are
 * the same shape. `data-active:bg-transparent` is the important part: the base
 * NavigationMenuLink style sets `data-active:bg-muted/50` while the trigger has
 * no data-active rule at all, so an active plain link used to render a filled
 * pill that an active dropdown never got. The rainbow underline is the brand's
 * active signal -- this leaves it as the only one, on both kinds of item.
 * Links *inside* the dropdown panels keep the pill, where it reads correctly.
 */
const TOP_LEVEL_ITEM =
  "rainbow-underline h-9 px-2.5 py-1.5 font-medium data-active:bg-transparent";

function isActive(pathname: string, href: string) {
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
      className="flex min-h-11 items-center rounded-lg px-2 text-sm font-medium hover:bg-muted"
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
      className="flex min-h-11 items-center rounded-lg pl-6 pr-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </Link>
  );
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
  const showEventsCta = isSlotVisible(hiddenSlots, "events");

  return (
    // One element, not a fragment. The header wrapper is `justify-between`, so
    // returning three siblings made it distribute four children instead of two
    // and spread ~537px of dead space across a 1152px header -- widening every
    // time the board hid another section.
    <div className="flex items-center gap-2">
      {/* Swaps at `lg`, not `sm`: the full nine-group nav needs 954px, so
          turning it on at 640px wrapped the header onto a second row for the
          whole tablet band. */}
      <nav aria-label="Main" className="hidden lg:block">
        <NavigationMenu>
          <NavigationMenuList className="flex-none justify-end">
            {groups.map((group) =>
              !group.links ? (
                <NavigationMenuItem key={group.label}>
                  <NavigationMenuLink
                    className={TOP_LEVEL_ITEM}
                    render={<Link href={group.href} />}
                    active={isActive(pathname, group.href)}
                  >
                    {group.label}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ) : (
                <NavigationMenuItem key={group.label}>
                  <NavigationMenuTrigger
                    className={TOP_LEVEL_ITEM}
                    data-active={isGroupActive(pathname, group) || undefined}
                  >
                    {group.label}
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-56 gap-1">
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

      {/* The header had no action at all: the site's only prominent CTA was the
          homepage Donate button, which is gated behind `support`.

          The breakpoints look fussy but each one is load-bearing. Measured with
          every section visible, the widest the header can get is logo 184 +
          nav 643 + CTA 111 + toggle 44 + gaps = 1014px, against 944px of usable
          width at `lg`. So the CTA shows while the nav is collapsed to the
          hamburger and there is room to spare (sm..lg), stands down for the one
          band where the full nav is out but the pair doesn't fit (lg..xl), and
          returns at `xl` where 1152px holds both. */}
      {showEventsCta && (
        <Button
          variant="rainbow"
          nativeButton={false}
          render={<Link href="/events" />}
          className="hidden sm:inline-flex lg:hidden xl:inline-flex"
        >
          Join an event
        </Button>
      )}

      <ThemeToggle />

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger
          render={
            <Button variant="ghost" size="icon" className="size-11 lg:hidden" />
          }
        >
          <MenuIcon />
          <span className="sr-only">Open menu</span>
        </SheetTrigger>
        <SheetContent side="right" size="sm">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav
            aria-label="Main"
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4"
          >
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
                  {/* Was an inert <p>, which made the section landing pages
                      unreachable from mobile entirely. */}
                  <MobileNavLink href={group.href} onNavigate={closeMobile}>
                    {group.label}
                  </MobileNavLink>
                  {group.links
                    .filter((link) => link.href !== group.href)
                    .map((link) => (
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
    </div>
  );
}
