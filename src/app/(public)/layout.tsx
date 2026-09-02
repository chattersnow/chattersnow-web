import Image from "next/image";
import Link from "next/link";
import { InstagramLink } from "@/components/instagram-link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPageVisibility, hiddenSlots } from "@/lib/page-visibility";
import { LEGAL_LINKS, visibleGroups } from "@/lib/public-nav";
import { SiteNav } from "./site-nav";

function FooterLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="app-muted text-sm hover:text-foreground">
      {label}
    </Link>
  );
}

// Derived from the same NAV_GROUPS the header renders, rather than a second
// hardcoded list -- the old FOOTER_LINKS had no About or Learn entry, so those
// sections stayed missing from the footer even when they were visible.
function SectionLinks({ hidden }: { hidden: string[] }) {
  return visibleGroups(hidden).map((group) => (
    <FooterLink key={group.href} href={group.href} label={group.label} />
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
      {/*
        Three zones over a legal bar. The section links, the contact details
        and the legal notices are three different kinds of thing, and running
        them together as one flat row left the privacy policy reading as a
        site section. The wordmark anchors the left column so the copyright
        line has something to attach to.
      */}
      <footer className="mt-16 px-6 py-10 sm:px-10">
        <div className="rainbow-strip -mt-10 mb-10" />
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-4">
              <Link href="/home" className="flex w-fit items-center gap-2">
                <Image
                  src="/chatter-logo-transparent.png"
                  alt="Chatter Snow"
                  width={643}
                  height={492}
                  className="h-8 w-auto"
                  style={{ width: "auto" }}
                />
                <span className="brand-display font-semibold tracking-[-0.02em]">
                  Chatter Snow
                </span>
              </Link>
              <nav
                aria-label="Footer"
                className="flex flex-wrap gap-x-6 gap-y-2"
              >
                <SectionLinks hidden={hidden} />
              </nav>
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
              <span className="app-eyebrow">Get in touch</span>
              <div className="app-muted flex flex-col gap-1 text-sm sm:items-end">
                <a
                  href="mailto:info@chattersnow.org"
                  className="hover:text-foreground underline-offset-4 hover:underline"
                >
                  info@chattersnow.org
                </a>
                <InstagramLink />
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-[var(--line)] pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="app-muted text-sm">
              &copy; {new Date().getFullYear()} Chatter Snow. All rights
              reserved.
            </p>
            <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-2">
              {LEGAL_LINKS.map((link) => (
                <FooterLink
                  key={link.href}
                  href={link.href}
                  label={link.label}
                />
              ))}
            </nav>
          </div>
        </div>
      </footer>
    </>
  );
}
