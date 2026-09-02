import Image from "next/image";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPageVisibility, hiddenSlots } from "@/lib/page-visibility";
import { visibleGroups } from "@/lib/public-nav";
import { SiteNav } from "./site-nav";

// Derived from the same NAV_GROUPS the header renders, rather than a second
// hardcoded list -- the old FOOTER_LINKS had no About or Learn entry, so those
// sections stayed missing from the footer even when they were visible.
function FooterLinks({ hidden }: { hidden: string[] }) {
  return visibleGroups(hidden).map((group) => (
    <Link
      key={group.href}
      href={group.href}
      className="app-muted text-sm hover:text-foreground"
    >
      {group.label}
    </Link>
  ));
}

// Deliberately awaited here rather than streamed, and the trade was measured
// rather than assumed. Suspense-wrapping the nav so the shell flushes first
// is a real TTFB win locally (~64ms -> ~7ms on pages that have their own
// loading.tsx), but it makes the nav arrive after first paint: a click landing
// in that window hits a node React is about to swap, and e2e/helpers/nav.ts's
// point-in-time viewport check reads the wrong shape. `--repeat-each=3` over
// the "nav resolves" specs failed 12/39 streamed against 2/39 awaited, where
// 2/39 is this suite's background flake rate on `development`. One small
// indexed query on initial load buys an always-interactive header.
//
// No loading.tsx can cover this either way: per Next's loading.js docs it
// wraps page.js and nested layouts but never the layout in its own segment,
// and it shows no fallback at all for a layout's runtime data access.
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const hidden = hiddenSlots(await getPageVisibility(supabase));

  return (
    <>
      <div className="rainbow-strip" />
      <header className="border-b border-[var(--line)] px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Link href="/home" className="flex shrink-0 items-center gap-2">
            <Image
              src="/chatter-logo-transparent.png"
              alt="Chatter Snow"
              width={643}
              height={492}
              className="h-10 w-auto"
              style={{ width: "auto" }}
              priority
            />
            <span className="brand-display text-lg font-semibold tracking-[-0.02em] sm:text-xl">
              Chatter Snow
            </span>
          </Link>
          <SiteNav hiddenSlots={hidden} />
        </div>
      </header>
      {children}
      <footer className="mt-16 px-6 py-10 sm:px-10">
        <div className="rainbow-strip -mt-10 mb-10" />
        <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            <FooterLinks hidden={hidden} />
          </nav>

          <div className="app-muted flex flex-col gap-1 text-sm sm:text-right">
            <a
              href="mailto:info@chattersnow.org"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              info@chattersnow.org
            </a>
            <a
              href="https://www.instagram.com/chattersnow"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              @chattersnow
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
