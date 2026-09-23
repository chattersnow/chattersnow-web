"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, LogOut, Menu, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { InstallAppItem } from "@/components/portal/install-app";
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
/**
 * The sheet's footer rows -- account, install, log out -- which are buttons
 * and links alike and have to look identical to each other.
 */
const ACCOUNT_ROW_CLASS =
  "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-base";

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

  // One section expanded at a time, the way the desktop sidebar behaves, and
  // the section owning the current route is the one open when the sheet is
  // first opened. Re-synced on navigation so reopening the sheet after moving
  // around never leaves a stale section expanded over the current one.
  const [openSection, setOpenSection] = useState<string | null>(activeSection);
  const [syncedSection, setSyncedSection] = useState(activeSection);

  if (activeSection !== syncedSection) {
    setSyncedSection(activeSection);
    setOpenSection(activeSection);
  }

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
        {/* Three bands rather than one long scrolling column: the header and
            the account footer stay put and only the module list moves, so the
            way out of the menu -- and the account, theme and log out rows --
            are always on screen instead of a whole tree's scroll away.
            `gap-0` because each band carries its own padding and the sheet's
            default gap would push the footer's border off its rows. */}
        <SheetContent
          side="right"
          className="w-[85%] gap-0 overflow-hidden p-0"
          // The sheet's own X is `size-8`, and this is the one surface in the
          // portal where touch is the only input -- 44px is the target the
          // tab bar, the theme toggle and the hamburger already meet (#1096).
          showCloseButton={false}
        >
          <SheetHeader className="shrink-0 flex-row items-start gap-2 space-y-0 px-3 pt-3 pb-2">
            <Tooltip>
              <SheetClose
                render={
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 shrink-0"
                        aria-label="Close menu"
                      />
                    }
                  />
                }
              >
                <X />
              </SheetClose>
              <TooltipContent>Close menu</TooltipContent>
            </Tooltip>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-2">
              <SheetTitle>Menu</SheetTitle>
              <SheetDescription>
                Everywhere in the portal your roles can reach.
              </SheetDescription>
            </div>
          </SheetHeader>
          {/* Sections collapse, one open at a time: expanded in full this tree
              runs several phone screens long, so the section you are looking
              for is off the bottom before you have read a heading. A section
              with a single reachable page stays a plain link -- there is
              nothing to expand, and a disclosure that reveals one row is a
              wasted tap.

              `min-h-0` is what actually lets this band scroll: without it a
              flex item's automatic minimum size is its content, so the list
              would stretch the popup instead of overflowing inside it. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
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
                    const isSectionActive = activeSection === item.value;
                    const collapsible = Boolean(
                      item.subItems && item.subItems.length > 1,
                    );
                    const isOpen = collapsible && openSection === item.value;
                    const rowClass = cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-base",
                      isSectionActive &&
                        "bg-[var(--purple-soft)] font-semibold text-[var(--purple-deep)]",
                    );

                    if (!collapsible) {
                      return (
                        <li key={item.value}>
                          <Link
                            href={item.href}
                            onClick={() => setSheetOpen(false)}
                            aria-current={isSectionActive ? "page" : undefined}
                            className={rowClass}
                          >
                            <Icon className="size-4 shrink-0" aria-hidden />
                            {item.label}
                          </Link>
                        </li>
                      );
                    }

                    return (
                      <li key={item.value}>
                        {/* `aria-expanded`/`aria-controls` are left to the Base
                            UI trigger, which emits both itself. */}
                        <Collapsible
                          open={isOpen}
                          onOpenChange={() =>
                            setOpenSection((prev) =>
                              prev === item.value ? null : item.value,
                            )
                          }
                        >
                          <CollapsibleTrigger
                            // Pinned only while this section is open, so a
                            // ten-item section like Governance keeps saying
                            // which section you are reading. `bg-popover` is
                            // not optional: the sheet paints its background
                            // further up, so without it the rows being
                            // scrolled show straight through the header.
                            className={cn(
                              rowClass,
                              isOpen && "sticky top-0 z-10 bg-popover",
                            )}
                          >
                            <Icon className="size-4 shrink-0" aria-hidden />
                            {item.label}
                            <ChevronRight
                              className={cn(
                                "ml-auto size-4 shrink-0 transition-transform",
                                isOpen && "rotate-90",
                              )}
                              aria-hidden
                            />
                          </CollapsibleTrigger>
                          <CollapsibleContent
                            // Clears the sticky trigger above, which is one
                            // min-h-11 row.
                            className="scroll-mt-11"
                            // On transitionend rather than in an effect: at the
                            // moment the state flips the panel is still at
                            // height 0, so anything measuring then scrolls to
                            // the wrong offset. Opening the last section in the
                            // sheet otherwise reveals its pages below the fold,
                            // which is the scrolling this change exists to
                            // remove.
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
                            <ul className="mb-1 ml-7 border-l border-[var(--line)] pl-3">
                              {item.subItems?.map((sub) => (
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
                          </CollapsibleContent>
                        </Collapsible>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {/* Not part of the permission-scoped module nav, the same way the
              desktop sidebar keeps them in its footer. The theme toggle
              joins them here rather than in the header: it is a preference
              set once, not a question about the page you are on.

              Pinned below the scrolling list rather than trailing it, so log
              out in particular is one tap from anywhere in the menu. The
              bottom padding matches the tab bar's, and for the same reason:
              `env()` resolves to 0 without `viewport-fit=cover`, so the
              constant is what clears the home indicator today. */}
          <div className="shrink-0 border-t border-[var(--line)] px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
            <Link
              href="/portal/account"
              onClick={() => setSheetOpen(false)}
              className={ACCOUNT_ROW_CLASS}
            >
              <UserRound className="size-4 shrink-0" aria-hidden />
              My Account
            </Link>
            <div className="flex min-h-11 items-center gap-1 px-1">
              <ThemeToggle className="size-11 rounded-md" />
              <span className="text-base">Appearance</span>
            </div>
            {/* Here rather than in the header or on the dashboard (#1083):
                installing is a thing you do once, from the same menu that
                holds the account and the theme, and it renders nothing at
                all on a browser that cannot install or has already. */}
            <InstallAppItem className={ACCOUNT_ROW_CLASS} />
            <button
              type="button"
              disabled={isSigningOut}
              onClick={() => setConfirmLogout(true)}
              className={ACCOUNT_ROW_CLASS}
            >
              <LogOut className="size-4 shrink-0" aria-hidden />
              {isSigningOut ? "Signing out..." : "Log out"}
            </button>
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
