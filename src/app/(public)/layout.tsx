import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { BrandLogoProvider } from "@/components/brand-logo-context";
import { BrandStyle } from "@/components/brand-style";
import { InstagramLink } from "@/components/instagram-link";
import { SkipLink } from "@/components/skip-link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPageVisibility, hiddenSlots } from "@/lib/page-visibility";
import { NOT_FOUND_TITLE, getPublicSite } from "@/lib/public-site";
import { isSlotVisible, visibleGroups } from "@/lib/public-nav";
import type { Lexicon } from "@/lib/lexicon";
import { documentsInForce, getLegalPublication } from "@/lib/legal-publication";
import { SiteNav } from "./site-nav";

// The organization's name and description, per tenant (#707 Phase 4). Every
// public page's own title is "<Page> | <name>", built from the same read.
export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  const site = await getPublicSite(supabase);
  // A host that resolves to no tenant gets no organization's name in its tab
  // (#795 Phase 4). The layout below 404s this request; without this the 404
  // page would still be titled after whichever organization the defaults name.
  if (site.status === "unresolved") {
    return { title: NOT_FOUND_TITLE };
  }
  return {
    // Undefined rather than a placeholder when the tenant read failed and
    // there is no name (#795 Phase 3): Next falls back to the root layout's
    // neutral title, which names no organization either.
    title: site.name ?? undefined,
    description: site.content.text("org.tagline"),
  };
}

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
function SectionLinks({
  hidden,
  lexicon,
}: {
  hidden: string[];
  lexicon: Lexicon;
}) {
  return visibleGroups(hidden, lexicon).map((group) => (
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
  const [visibility, site, publication] = await Promise.all([
    getPageVisibility(supabase),
    getPublicSite(supabase),
    getLegalPublication(supabase),
  ]);
  // The public site is the one surface that belongs to a host rather than to a
  // session, so a host no tenant claims has nothing to serve (#795 Phase 4).
  // Before this, such a request rendered the platform defaults -- which meant a
  // domain pointed at the deployment before its tenant row existed spent that
  // window publicly serving another organization's name and copy, with the
  // page_visibility-gated routes 404ing underneath it.
  //
  // Only `unresolved`. A failed read is `unavailable` and keeps rendering:
  // 404ing a database blip would take every tenant's site down at once, which
  // is far worse than the thing this guard prevents.
  //
  // The portal is deliberately unaffected -- `current_tenant_id()` is
  // membership-based and never consults the host, which is what lets
  // portal.<anything> work before its domain is configured.
  if (site.status === "unresolved") {
    notFound();
  }

  const hidden = hiddenSlots(visibility);
  const { name, branding, content, lexicon } = site;
  const contactEmail = content.text("org.email_general");
  const supportLabel = `Support ${content.text("org.short_name")}`;

  return (
    <>
      <BrandStyle branding={branding} />
      <SkipLink href="#main-content" />
      <div className="rainbow-strip" />
      <header className="border-b border-[var(--line)] px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Link href="/home" className="flex shrink-0 items-center gap-2">
            <BrandLogo
              logoUrl={branding.logoUrl}
              alt={name ?? ""}
              className="h-10 w-10"
              priority
            />
            {name && (
              <span className="brand-display text-lg font-semibold tracking-[-0.02em] sm:text-xl">
                {name}
              </span>
            )}
          </Link>
          <SiteNav
            hiddenSlots={hidden}
            supportLabel={supportLabel}
            lexicon={lexicon}
          />
        </div>
      </header>
      {/* The tenant's own mark for every image placeholder below the header --
          event fliers and gear photos that have not been uploaded yet. The
          header and footer take `logoUrl` directly; the placeholders sit too
          deep, and in client components, to be handed it. */}
      <BrandLogoProvider logoUrl={branding.logoUrl}>
        {children}
      </BrandLogoProvider>
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
                <BrandLogo
                  logoUrl={branding.logoUrl}
                  alt={name ?? ""}
                  className="h-8 w-8"
                />
                <span className="brand-display font-semibold tracking-[-0.02em]">
                  {name}
                </span>
              </Link>
              <nav
                aria-label="Footer"
                className="flex flex-wrap gap-x-6 gap-y-2"
              >
                <SectionLinks hidden={hidden} lexicon={lexicon} />
              </nav>
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
              <span className="app-eyebrow">
                {content.text("org.footer_contact_eyebrow")}
              </span>
              <div className="app-muted flex flex-col gap-1 text-sm sm:items-end">
                <a
                  href={`mailto:${contactEmail}`}
                  className="hover:text-foreground underline-offset-4 hover:underline"
                >
                  {contactEmail}
                </a>
                <InstagramLink
                  handle={content.text("org.instagram_handle")}
                  orgName={name ?? "this organization"}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 border-t border-[var(--line)] pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="app-muted text-sm">
              &copy; {new Date().getFullYear()}
              {name ? ` ${name}.` : ""} All rights reserved.
            </p>
            {/* Both link groups sit in one right-hand cluster, so the bar is
                two zones rather than three. Left as three children of
                `justify-between`, the middle one lands wherever the widths of
                the other two leave it -- not centred on anything, and reading
                as an orphan rather than as a sibling of the link beside it.
                They stay two landmarks inside it: a brand guide and the terms
                of using the site are different things to a screen reader,
                whatever they look like on the page. */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {/* Not a SectionLinks entry, and deliberately not in the header.
                The brand guide's whole value is its URL -- it is pasted into
                an email to a sponsor or a print shop, not browsed to -- so it
                sits with the utility links rather than competing with Events
                and Programs. Its own landmark rather than joining the Legal
                one, which is a nav about the terms of using the site. */}
              {isSlotVisible(hidden, "brand") && (
                <nav
                  aria-label="Resources"
                  className="flex flex-wrap gap-x-6 gap-y-2"
                >
                  <FooterLink href="/brand" label="Brand & Design" />
                </nav>
              )}
              {/* Only the documents this tenant serves (#859). The privacy
                policy is always one of them, so this landmark is never empty --
                an empty <nav aria-label="Legal"> would be announced by screen
                readers as a landmark with nothing in it. A document that is not
                in force drops out of here and 404s at its URL together;
                dropping only the link would leave text nobody adopted at a
                guessable address. */}
              <nav
                aria-label="Legal"
                className="flex flex-wrap gap-x-6 gap-y-2"
              >
                {documentsInForce(publication).map((document) => (
                  <FooterLink
                    key={document.route}
                    href={document.route}
                    label={document.label}
                  />
                ))}
              </nav>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
