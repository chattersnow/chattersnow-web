"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toPortalPathname } from "@/lib/portal/paths";
import { type PermissionMap } from "@/lib/auth/permissions";
import {
  activeSectionFor,
  navGroups,
  primaryNavItems,
  visibleNavItems,
} from "@/lib/portal/nav";
import { type Lexicon } from "@/lib/lexicon";
import { DEFAULT_VOCABULARY } from "@/lib/person-roles";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOutAndRedirect } from "@/lib/auth/sign-out";
import { sectionIcon } from "../nav-icons";
import { LogoutConfirmDialog } from "../logout-confirm-dialog";

/**
 * The mobile shell's navigation: a bottom tab bar of thumb-reachable
 * destinations, plus the whole tree behind a sheet (#1079).
 *
 * Tab bar and sheet are one component because the bar's last slot opens the
 * sheet, so they share its open state. Both read `visibleNavItems()` -- the
 * same function the sidebar and the command palette read -- so entitlements
 * are applied once and a phone can never be offered a module a tenant does
 * not have.
 */
export function MobileNav({
  permissions,
  lexicon = DEFAULT_VOCABULARY,
}: {
  permissions: PermissionMap;
  lexicon?: Lexicon;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  // The portal host serves prefix-free URLs; nav hrefs are canonical
  // `/portal/...` paths, so normalize before matching.
  const pathname = toPortalPathname(usePathname());
  const activeSection = activeSectionFor(pathname) ?? null;

  const items = visibleNavItems(permissions, lexicon);
  const tabs = primaryNavItems(items);

  return (
    <>
      {/* `fixed`, not `sticky`: the page scrolls under it and the bar has to
          stay on the glass whatever the content does.

          The padding is `max(env(safe-area-inset-bottom), 0.5rem)` rather than
          the inset alone, because `env()` safe-area insets resolve to 0 unless
          the page opts in with `viewport-fit=cover` -- which this app does not,
          and which is not a change to make blind, since it would also let the
          public site slide under the notch in landscape. The constant clears
          the home indicator today and the inset takes over automatically if
          `viewport-fit` is ever turned on. */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[var(--background)] pb-[max(env(safe-area-inset-bottom),0.5rem)]"
      >
        <ul className="flex items-stretch">
          {tabs.map((item) => {
            const Icon = sectionIcon(item.value);
            const active = activeSection === item.value;
            return (
              <li key={item.value} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[var(--foreground)]",
                    active && "font-semibold text-[var(--purple-deep)]",
                  )}
                >
                  <Icon className="size-5 shrink-0" aria-hidden />
                  <span className="max-w-full truncate text-[0.6875rem] leading-none">
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              className="flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[var(--foreground)]"
            >
              <Menu className="size-5 shrink-0" aria-hidden />
              <span className="max-w-full truncate text-[0.6875rem] leading-none">
                More
              </span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-[85%] overflow-y-auto p-0"
          // The sheet's own X is `size-8`, and this is the one surface in the
          // portal where touch is the only input -- 44px is the target the
          // tab bar, the theme toggle and the hamburger already meet (#1096).
          showCloseButton={false}
        >
          <SheetHeader className="flex-row items-start gap-2 space-y-0 px-3 pt-3">
            <SheetClose
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0"
                  aria-label="Close menu"
                />
              }
            >
              <X />
            </SheetClose>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-2">
              <SheetTitle>Menu</SheetTitle>
              <SheetDescription>
                Everywhere in the portal your roles can reach.
              </SheetDescription>
            </div>
          </SheetHeader>
          {/* Every section and every sub-item, flat and scrollable rather than
              collapsed: this is the surface that has to make good on "no real
              destination appears in no navigation surface", so hiding half of
              it behind another tap would defeat the point. */}
          <div className="px-2 pb-24">
            {navGroups(items).map((group) => (
              <div key={group.label ?? "ungrouped"} className="py-2">
                {group.label && (
                  <h2 className="app-muted px-3 pb-1 text-xs font-semibold uppercase tracking-[0.1em]">
                    {group.label}
                  </h2>
                )}
                <ul>
                  {group.items.map((item) => {
                    const Icon = sectionIcon(item.value);
                    return (
                      <li key={item.value}>
                        <Link
                          href={item.href}
                          onClick={() => setSheetOpen(false)}
                          aria-current={
                            activeSection === item.value ? "page" : undefined
                          }
                          className={cn(
                            "flex min-h-11 items-center gap-3 rounded-md px-3 text-base",
                            activeSection === item.value &&
                              "bg-[var(--purple-soft)] font-semibold text-[var(--purple-deep)]",
                          )}
                        >
                          <Icon className="size-4 shrink-0" aria-hidden />
                          {item.label}
                        </Link>
                        {item.subItems && item.subItems.length > 1 && (
                          <ul className="mb-1 ml-7 border-l border-[var(--line)] pl-3">
                            {item.subItems.map((sub) => (
                              <li key={sub.value}>
                                <Link
                                  href={sub.href}
                                  onClick={() => setSheetOpen(false)}
                                  aria-current={
                                    pathname === sub.href ? "page" : undefined
                                  }
                                  className={cn(
                                    "flex min-h-10 items-center rounded-md px-2 text-sm",
                                    pathname === sub.href &&
                                      "font-semibold text-[var(--purple-deep)]",
                                  )}
                                >
                                  {sub.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {/* Not part of the permission-scoped module nav, the same way the
                desktop sidebar keeps them in its footer. The theme toggle
                joins them here rather than in the header: it is a preference
                set once, not a question about the page you are on. */}
            <div className="mt-2 border-t border-[var(--line)] pt-2">
              <Link
                href="/portal/account"
                onClick={() => setSheetOpen(false)}
                className="flex min-h-11 items-center gap-3 rounded-md px-3 text-base"
              >
                <UserRound className="size-4 shrink-0" aria-hidden />
                My Account
              </Link>
              <div className="flex min-h-11 items-center gap-1 px-1">
                <ThemeToggle className="size-11 rounded-md" />
                <span className="text-base">Appearance</span>
              </div>
              <button
                type="button"
                disabled={isSigningOut}
                onClick={() => setConfirmLogout(true)}
                className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-base"
              >
                <LogOut className="size-4 shrink-0" aria-hidden />
                {isSigningOut ? "Signing out..." : "Log out"}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <LogoutConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        onConfirm={async () => {
          setIsSigningOut(true);
          await signOutAndRedirect(router);
        }}
      />
    </>
  );
}
