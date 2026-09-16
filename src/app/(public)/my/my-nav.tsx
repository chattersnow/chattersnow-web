import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import { cn } from "@/lib/utils";
import { SignOutButton } from "./sign-out-button";

/**
 * The constituent area's navigation (#1180).
 *
 * `/my` had one child when #1161 landed and has four now -- three of them
 * signed-in jobs, plus the sign-in page. The answer until this component was a
 * row of outline links inside a `<p>` on the hub page alone. Three things were wrong with that. A paragraph used as a flex
 * container is not announced as navigation and cannot be jumped to. The row
 * existed only on `/my`, so moving between two children cost two navigations,
 * out through an outline button and back through an underlined text link. And
 * its membership changed per person -- "Log your hours" rendered only for
 * somebody with volunteering behind them, which hid it from exactly the person
 * about to volunteer for the first time.
 *
 * docs/portal-navigation.md:25-26 governs: four sibling jobs, each a different
 * job from reading your history rather than a different view of it, so each
 * gets an entry and every entry is always present. The one rule that could be
 * read as arguing the other way -- "a real destination that appears in no
 * navigation surface" -- was the argument the old comment made, and a
 * paragraph is not a navigation surface.
 */

export type MyNavKey = "home" | "details" | "hours" | "notifications";

const ENTRIES: { key: MyNavKey; href: string; label: string }[] = [
  { key: "home", href: MY_PATH_PREFIX, label: "Your account" },
  { key: "details", href: `${MY_PATH_PREFIX}/details`, label: "Your details" },
  { key: "hours", href: `${MY_PATH_PREFIX}/hours`, label: "Log your hours" },
  {
    key: "notifications",
    href: `${MY_PATH_PREFIX}/notifications`,
    label: "Your emails",
  },
];

// min-h-11 is the 44px touch minimum from docs/public-site-ux-audit.md finding
// 8. It beats the size variant's own `h-8` because min-height wins over height,
// so the entries keep the button shape and gain the target size.
const ENTRY = "min-h-11 px-4";

export function MyNav({
  current,
  label = "Your account",
  showSignOut = false,
  className,
}: {
  /** Which entry is the page being rendered. */
  current: MyNavKey;
  /**
   * Overridden only by a second copy of this nav on one page. Two landmarks of
   * the same role and the same name read as one thing listed twice, so the
   * repeat at the foot of `/my/details` says where it is instead.
   */
  label?: string;
  /**
   * The seam with #1175. That issue put an account menu carrying sign-out in
   * the public header, so the answer is `false` everywhere today and this
   * stays a prop rather than a deletion: a tenant whose header is too narrow
   * for the menu, or a future surface that renders this nav without one, needs
   * the action somewhere.
   */
  showSignOut?: boolean;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("mt-4 flex flex-wrap items-center gap-3", className)}
    >
      {ENTRIES.map((entry) =>
        entry.key === current ? (
          // The page you are on is not somewhere to go. Rendering it as text
          // rather than a self-link keeps it out of the tab order and off the
          // list of things that look like they do something.
          <span
            key={entry.key}
            aria-current="page"
            className={cn(
              buttonVariants({ variant: "secondary" }),
              ENTRY,
              "cursor-default",
            )}
          >
            {entry.label}
          </span>
        ) : (
          <Link
            key={entry.key}
            href={entry.href}
            className={cn(buttonVariants({ variant: "outline" }), ENTRY)}
          >
            {entry.label}
          </Link>
        ),
      )}
      {showSignOut ? <SignOutButton /> : null}
    </nav>
  );
}
