import type { ReactNode } from "react";
import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MyNav, type MyNavKey } from "./my-nav";

/**
 * The one shape every signed-in page in the constituent area renders in.
 *
 * Four pages had written the same header section out four times -- accent
 * rule, `h1`, intro paragraph, nav -- and then stacked their content beneath
 * it in the full `max-w-6xl` public column. Two things came of that.
 *
 * The nav scrolled away. `/my/details` is long enough that reaching its Save
 * button leaves every destination off-screen, and the answer #1180 shipped was
 * a second copy of the nav at the foot of that one page: two navigation
 * landmarks, named differently so they would not read as one thing listed
 * twice. A column that stays put is the same fix without the duplicate.
 *
 * And the prose ran the width of the column. `PageShell` is deliberately one
 * width for every public page (`docs/public-page-widths.md`), and a field
 * description set across 1152px is the 120-character line the constituent area
 * audit measured. Giving the nav a track of its own leaves the content around
 * `max-w-4xl` without any page choosing its own column.
 *
 * Below `lg` the grid collapses to one column and `MyNav` wraps into a strip
 * above the content, which is where it already was.
 */

/**
 * Nav track, then content. The fixed first track rather than a fraction
 * because the entries are four known labels and a proportional column would
 * set their width from the window instead.
 */
const COLUMNS = "mt-8 grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12";

const TITLE_CLASS =
  "brand-display mt-4 text-4xl font-semibold tracking-brand sm:text-5xl";

const INTRO_CLASS =
  "app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base";

/** Four entries, at roughly the width their labels set below `lg`. */
const ENTRY_WIDTHS = ["w-32", "w-28", "w-32", "w-28"];

export function MyPageLayout({
  current,
  title,
  intro,
  showNav = true,
  children,
}: {
  current: MyNavKey;
  title: string;
  intro: ReactNode;
  /**
   * `/my` renders the claim form to an account with no record behind it yet.
   * There is nothing to edit, log or choose until a staffer approves the
   * claim, so that page passes `false` and gets one column -- navigation to
   * three pages that would all bounce straight back is not navigation.
   */
  showNav?: boolean;
  children: ReactNode;
}) {
  return (
    <PageShell>
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className={TITLE_CLASS}>{title}</h1>
        </div>
        <p className={INTRO_CLASS}>{intro}</p>
      </section>

      {showNav ? (
        <div className={COLUMNS}>
          {/* `lg:self-start` is load-bearing, not tidiness: a grid item
              stretches to its row by default, and an element as tall as the
              box it scrolls in can never stick to anything. */}
          <MyNav
            current={current}
            className="lg:sticky lg:top-8 lg:self-start"
          />
          <div className="min-w-0 space-y-8">{children}</div>
        </div>
      ) : (
        <div className="mt-8 space-y-8">{children}</div>
      )}
    </PageShell>
  );
}

/**
 * The same frame, for the four `loading.tsx` files.
 *
 * It lives here so the two cannot drift: a skeleton whose columns do not match
 * the page it stands in for moves everything sideways the moment the real page
 * arrives, which is the jump a fallback exists to prevent.
 */
export function MyPageSkeleton({
  titleWidth,
  intro,
  children,
}: {
  /** About as wide as the `h1` being stood in for. */
  titleWidth: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <PageShell>
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <Skeleton className={cn("mt-4 h-10 sm:h-12", titleWidth)} />
        </div>
        <div className="mt-4 space-y-2">{intro}</div>
      </section>

      <div className={COLUMNS}>
        <div className="flex flex-wrap gap-1 lg:flex-col">
          {ENTRY_WIDTHS.map((width, index) => (
            <Skeleton
              key={index}
              className={cn("h-11 rounded-lg lg:w-full", width)}
            />
          ))}
        </div>
        <div className="min-w-0 space-y-8">{children}</div>
      </div>
    </PageShell>
  );
}
