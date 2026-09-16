"use client";

import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MY_PATH_PREFIX, MY_SIGN_IN_PATH } from "@/lib/constituent/paths";
import type { ConstituentAccountNav } from "@/lib/constituent/account-nav";
import { useConstituentSignOut } from "@/lib/constituent/use-sign-out";

/**
 * The control's own box, shared by the signed-out link and the signed-in
 * trigger so the two never differ in size as the session changes under them.
 *
 * A 44px square matching the theme toggle beside it, widening to hold the
 * name only at `xl` -- see "Why icon-first" below.
 */
const CONTROL_CLASS = "size-11 gap-2 xl:w-auto xl:px-3";

/**
 * The public site's way in to `/my` (#1175).
 *
 * `/my` shipped with no link to it anywhere -- not in the nav, not in the
 * footer -- so a person reached their own record by typing the URL, and signed
 * out by navigating back to the one page that had the button. This is the
 * entry point, and it lives in the header's utility cluster beside the theme
 * toggle rather than among the nav groups: those are the website's sections,
 * and an account is not one of them.
 *
 * Signed out it is a plain link, not a menu. There is exactly one destination,
 * and a dropdown holding a single item is a second click for nothing.
 *
 * ## Why icon-first
 *
 * The header's width is already spoken for -- `site-nav.tsx` keeps the
 * measurement, and it is why "Join an event" stands down across the `lg`..`xl`
 * band. An account control is a utility rather than a call to action, so it
 * must *not* take that treatment: a control that vanishes at one width is a
 * control nobody trusts. Icon-only is what fits at every width; the name joins
 * it at `xl`, where the same measurement leaves room.
 */
export function AccountMenu({
  account,
  className,
}: {
  account: ConstituentAccountNav;
  className?: string;
}) {
  const { signOut, isSigningOut } = useConstituentSignOut();

  if (!account.enabled) return null;

  if (!account.signedIn) {
    // A `Link` wearing the button's classes, not a `Button` rendering a link.
    // Base UI's `nativeButton={false}` stamps `role="button"` on the anchor,
    // which is right for the "Join an event" CTA beside it and wrong here: this
    // navigates, and a screen reader should be told so. `buttonVariants` is the
    // codebase's existing answer for a link that looks like a button.
    return (
      <Link
        href={MY_SIGN_IN_PATH}
        aria-label="Sign in"
        className={cn(
          buttonVariants({ variant: "ghost" }),
          CONTROL_CLASS,
          className,
        )}
      >
        <UserRound className="size-4 shrink-0" aria-hidden />
        <span className="hidden xl:inline">Sign in</span>
      </Link>
    );
  }

  const { label, email } = account;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className={cn(CONTROL_CLASS, className)}
            // Names the person even where the label is not on screen, which is
            // every width below `xl` -- a screen reader should not have to open
            // the menu to learn whose account this is.
            aria-label={label ? `Your account, ${label}` : "Your account"}
          />
        }
      >
        <UserRound />
        <span className="hidden max-w-24 truncate xl:inline">
          {label ?? "Account"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* The group is not decoration: `DropdownMenuLabel` is Base UI's
            `Menu.GroupLabel`, which throws "MenuGroupContext is missing" the
            moment the menu opens if it is not inside one. Types do not catch
            it and a test that never opens the menu does not either. */}
        <DropdownMenuGroup>
          {/* The address rather than the name: the name is already on the
              trigger at `xl`, and what someone checks here is *which* account
              they are signed in as -- a question only the address answers on a
              site one person may hold two of. */}
          <DropdownMenuLabel className="truncate font-normal">
            {email ?? label ?? "Signed in"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {/* One destination, not a copy of `/my`'s own links. `/my` is the hub
              for details, hours and notifications alike, and promoting one of
              those three into the header would be picking a favourite -- so the
              menu carries the way in and the way out, and nothing in between. */}
          <DropdownMenuItem render={<Link href={MY_PATH_PREFIX} />}>
            <UserRound />
            Your account
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut} disabled={isSigningOut}>
            <LogOut />
            {isSigningOut ? "Signing out..." : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The same actions as rows, for the mobile menu sheet.
 *
 * Below `sm` the header is logo, name, theme and the hamburger, and a fifth
 * control wraps it onto a second row -- so on a phone the account moves into
 * the sheet instead. The shape is the portal's own mobile menu (its account,
 * appearance and log-out rows sit in a pinned band below the scrolling tree);
 * copying it keeps one answer to "where is my account on a phone" across both
 * surfaces rather than two.
 */
const ACCOUNT_ROW_CLASS =
  "flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm font-medium hover:bg-muted";

export function AccountSheetRows({
  account,
  onNavigate,
  className,
}: {
  account: ConstituentAccountNav;
  onNavigate: () => void;
  className?: string;
}) {
  const { signOut, isSigningOut } = useConstituentSignOut();

  if (!account.enabled) return null;

  return (
    <div
      className={cn(
        "mt-auto shrink-0 border-t border-[var(--line)] px-4 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)]",
        className,
      )}
    >
      {account.signedIn ? (
        <>
          {account.email && (
            <p className="app-muted truncate px-2 pt-1 pb-2 text-xs">
              {account.email}
            </p>
          )}
          <Link
            href={MY_PATH_PREFIX}
            onClick={onNavigate}
            className={ACCOUNT_ROW_CLASS}
          >
            <UserRound className="size-4 shrink-0" aria-hidden />
            Your account
          </Link>
          <button
            type="button"
            disabled={isSigningOut}
            onClick={signOut}
            className={ACCOUNT_ROW_CLASS}
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            {isSigningOut ? "Signing out..." : "Sign out"}
          </button>
        </>
      ) : (
        <Link
          href={MY_SIGN_IN_PATH}
          onClick={onNavigate}
          className={ACCOUNT_ROW_CLASS}
        >
          <UserRound className="size-4 shrink-0" aria-hidden />
          Sign in
        </Link>
      )}
    </div>
  );
}
