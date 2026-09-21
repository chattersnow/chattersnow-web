import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
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
import {
  constituentAreaEnabled,
  getConstituentAccountNav,
} from "@/lib/constituent/guard";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { servesPublicApp, surfaceAtRoot } from "@/lib/pwa/host";
import {
  APPLE_TOUCH_ICON_SIZE,
  APP_ICON_PATH,
  PUBLIC_MANIFEST_PATH,
} from "@/lib/pwa/manifest";
import { serviceWorkerScope } from "@/lib/pwa/service-worker";
import { MY_PATH_PREFIX, MY_SIGN_IN_PATH } from "@/lib/constituent/paths";
import { SiteNav } from "./site-nav";

/**
 * Whether this request's host should advertise the supporter app (#1171).
 *
 * Mirrors the conditions `/site.webmanifest` answers on, because a link to a
 * manifest that 404s is an install prompt that fails in front of the visitor:
 *
 *   - a `portal.` host serves no public page, so there is no app to install;
 *   - a host that serves both surfaces from one origin narrows the public
 *     app's `start_url` to `/my`, which the `constituent_accounts` module
 *     gates -- and that module is off by default;
 *   - a host whose portal lives elsewhere installs the whole website, so
 *     there is nothing to gate.
 *
 * The module read is free here: it goes through the same `cache()`d
 * `getPublicTenantModules` the layout below already awaits by way of
 * `getPageVisibility`.
 */
async function publicManifestPath(host: string): Promise<string | undefined> {
  if (!servesPublicApp(host)) return undefined;
  if (surfaceAtRoot("public", host)) return PUBLIC_MANIFEST_PATH;
  return (await constituentAreaEnabled()) ? PUBLIC_MANIFEST_PATH : undefined;
}

// The organization's name and description, per tenant (#707 Phase 4). Every
// public page's own title is "<Page> | <name>", built from the same read.
export async function generateMetadata(): Promise<Metadata> {
  const [supabase, requestHeaders] = await Promise.all([
    createSupabaseServerClient(),
    headers(),
  ]);
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
    // The public site is its own installable app (#1171), linked from here
    // rather than from a root metadata route -- a root one put the *portal's*
    // manifest on every page of every host, so an Add to Home Screen from the
    // website installed the staff portal.
    manifest: await publicManifestPath(requestHeaders.get("host") ?? ""),
    // iOS ignores the manifest's icons when adding a page to the home screen,
    // so without this the supporter app installs as a screenshot of whatever
    // page was open. The same route the portal points at, already resolved
    // from the host.
    icons: { apple: `${APP_ICON_PATH}/${APPLE_TOUCH_ICON_SIZE}` },
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
  const [supabase, requestHeaders] = await Promise.all([
    createSupabaseServerClient(),
    headers(),
  ]);
  const [visibility, site, publication, account] = await Promise.all([
    getPageVisibility(supabase),
    getPublicSite(supabase),
    getLegalPublication(supabase),
    // Joins the same wave rather than following it: the module half of this
    // read is already in flight as part of getPageVisibility (both go through
    // the cached getPublicTenantModules), and the session half is a local JWT
    // verification, so the layout's critical path is unchanged.
    getConstituentAccountNav(supabase),
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
  // The portal does not 404 with the site. An unresolved host is exactly the
  // state a tenant is in before its domain is configured, and #956 leaves the
  // portal's host rule inert there for that reason: the operator still has to
  // be able to sign in and finish setting the tenant up.
  if (site.status === "unresolved") {
    notFound();
  }

  const hidden = hiddenSlots(visibility);
  // The same condition the manifest link is emitted on: a worker scoped to an
  // app this host does not advertise would have no page to control (#1171).
  const host = requestHeaders.get("host") ?? "";
  const installable = Boolean(await publicManifestPath(host));
  const { name, branding, content, lexicon } = site;
  const contactEmail = content.text("org.email_general");
  const supportLabel = `Support ${content.text("org.short_name")}`;

  return (
    <>
      <BrandStyle branding={branding} />
      {/* The supporter app's half of the PWA (#1171). Mounted at the top of
          the public tree, the way the portal's shells mount it at the top of
          theirs, so a navigation inside the site does not re-register it.
          The scope is resolved here rather than in the browser -- the server
          is what knows the host, and the client re-deriving it would be a
          second copy of the rule the manifest's `scope` follows. */}
      {installable && (
        <ServiceWorkerRegistrar
          scope={serviceWorkerScope("public", surfaceAtRoot("public", host))}
        />
      )}
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
            account={account}
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
              {/* The account link joins the brand guide here, and for the same
                  reason it is not a SectionLinks entry: these are utilities,
                  not sections of the website, and `NAV_GROUPS` is the list of
                  sections. It is the header control's quiet twin -- a returning
                  visitor who has scrolled to the bottom of a page should not
                  have to scroll back up to find their way in (#1175). The
                  guard covers both, so the landmark is never announced empty.
               */}
              {(isSlotVisible(hidden, "brand") || account.enabled) && (
                <nav
                  aria-label="Resources"
                  className="flex flex-wrap gap-x-6 gap-y-2"
                >
                  {isSlotVisible(hidden, "brand") && (
                    <FooterLink href="/brand" label="Brand & Design" />
                  )}
                  {account.enabled && (
                    <FooterLink
                      href={account.signedIn ? MY_PATH_PREFIX : MY_SIGN_IN_PATH}
                      label={account.signedIn ? "Your account" : "Sign in"}
                    />
                  )}
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
