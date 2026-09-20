import Link from "next/link";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import { cn } from "@/lib/utils";
import { SignOutButton } from "./sign-out-button";

/**
 * The constituent area's navigation (#1180).
 *
 * `/my` had one child when #1161 landed. The answer until this component was a
 * row of outline links inside a `<p>` on the hub page alone. Three things were
 * wrong with that. A paragraph used as a flex container is not announced as
 * navigation and cannot be jumped to. The row existed only on `/my`, so moving
 * between two children cost two navigations, out through an outline button and
 * back through an underlined text link. And its membership changed per person,
 * which hid an entry from exactly the person who most needed to find it.
 *
 * docs/portal-navigation.md:25-26 governs: sibling jobs, each a different job
 * from reading your history rather than a different view of it, so each gets
 * an entry and every entry is always present. The one rule that could be read
 * as arguing the other way -- "a real destination that appears in no
 * navigation surface" -- was the argument the old comment made, and a
 * paragraph is not a navigation surface.
 *
 * "Log your hours" was a fourth entry until #1303. Self-logging duplicated
 * `/portal/volunteers/participation`, which does the same job for the same
 * person with a view of what was confirmed behind it, so the public copy went
 * rather than being kept in step with it.
 *
 * ## Why these are not buttons
 *
 * They wore `buttonVariants` until the layout pass. Four filled and outlined
 * controls at the top of a page whose real actions are "Send a confirmation
 * link" and "Save" put navigation and action in the same costume, with
 * navigation winning on weight -- and `/my/details` has both on screen at
 * once. These are rows of a list now: a resting state of nothing, a hover, and
 * a filled current entry.
 *
 * The shape follows `MyPageLayout`'s two columns. Stacked as a sidebar list
 * from `lg`, wrapped into a strip below it, from one set of entries -- the
 * alternative was rendering the nav twice with one copy hidden at each width,
 * which is two tab stops and two landmarks for one navigation.
 */

export type MyNavKey = "home" | "details" | "notifications";

const ENTRIES: { key: MyNavKey; href: string; label: string }[] = [
  { key: "home", href: MY_PATH_PREFIX, label: "Your account" },
  { key: "details", href: `${MY_PATH_PREFIX}/details`, label: "Your details" },
  {
    key: "notifications",
    href: `${MY_PATH_PREFIX}/notifications`,
    label: "Your emails",
  },
];

// min-h-11 is the 44px touch minimum from docs/public-site-ux-audit.md finding
// 8, kept from the button version: below `lg` these sit in a strip a thumb
// reaches for.
const ENTRY =
  "flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors lg:w-full";

export function MyNav({
  current,
  showSignOut = false,
  className,
}: {
  /** Which entry is the page being rendered. */
  current: MyNavKey;
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
      aria-label="Your account"
      className={cn(
        "flex flex-wrap items-center gap-1 lg:flex-col lg:items-stretch",
        className,
      )}
    >
      {ENTRIES.map((entry) =>
        entry.key === current ? (
          // The page you are on is not somewhere to go. Rendering it as text
          // rather than a self-link keeps it out of the tab order and off the
          // list of things that look like they do something.
          <span
            key={entry.key}
            aria-current="page"
            className={cn(ENTRY, "bg-muted text-foreground")}
          >
            {entry.label}
          </span>
        ) : (
          <Link
            key={entry.key}
            href={entry.href}
            className={cn(
              ENTRY,
              "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {entry.label}
          </Link>
        ),
      )}
      {showSignOut ? <SignOutButton /> : null}
    </nav>
  );
}
