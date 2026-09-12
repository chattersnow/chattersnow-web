/**
 * The public site's navigation tree -- the single source the header nav, the
 * mobile sheet and the footer all render from.
 *
 * It used to be two hardcoded lists (NAV_GROUPS in site-nav.tsx and
 * FOOTER_LINKS in (public)/layout.tsx) that both duplicated the slot mapping
 * from PUBLIC_PAGE_SLOTS, and they had already drifted: the footer was missing
 * About and Learn entirely, so those sections would have stayed absent from it
 * even after the board turned them back on.
 */

import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";
import { DEFAULT_LEXICON, applyLexicon, type Lexicon } from "@/lib/lexicon";

export type NavLink = {
  /**
   * May carry `{term}` placeholders from the lexicon registry (#896).
   * `visibleGroups()` resolves them; nothing else should render this raw.
   */
  label: string;
  href: string;
  slot?: string;
};

export type NavGroup = {
  /** A lexicon template, like `NavLink.label`. */
  label: string;
  /**
   * The section's landing page. Used as the footer link and as the mobile
   * sheet's group heading target, so every group is reachable as a whole and
   * not just through its children.
   */
  href: string;
  /**
   * Ties the group to an entry in PUBLIC_PAGE_SLOTS, so a section the board has
   * hidden from Website > Page visibility drops out of the nav and the
   * footer together. A group with no slot is always shown.
   */
  slot?: string;
  /** Dropdown children. Absent means a plain top-level link. */
  links?: readonly NavLink[];
};

/**
 * Where a section's landing page is a real page of its own rather than a
 * redirect to one of its children, it gets an explicit entry in `links` -- a
 * Base UI NavigationMenuTrigger opens its panel instead of navigating, so
 * without one the landing page is unreachable from the desktop nav.
 *
 * `/about` and `/inventory` deliberately have no such entry: both redirect to a
 * child that is already listed (`/about/story`, `/inventory/library`), so an
 * overview item would be a second route to the same page.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "About",
    href: "/about",
    slot: "about",
    links: [
      { label: "Our Story", href: "/about/story" },
      { label: "Mission & Values", href: "/about/mission" },
      { label: "Meet the Team", href: "/about/team" },
    ],
  },
  {
    label: "Events",
    href: "/events",
    slot: "events",
    links: [
      { label: "All Events", href: "/events" },
      { label: "Community Calendar", href: "/events/community" },
    ],
  },
  { label: "Programs", href: "/programs", slot: "programs" },
  { label: "Learn", href: "/learn", slot: "learn" },
  {
    // The one group whose labels are a tenant's word rather than the
    // platform's (#896): a nonprofit that lends tools, instruments or food
    // reads the same tables and calls this something else. `gears` here and
    // below is the internal slot key, not a product name -- it is not renamed
    // and does not appear on screen.
    label: "{item_plural}",
    href: "/inventory",
    slot: "gears",
    links: [
      { label: "{collection_public}", href: "/inventory/library" },
      {
        label: "Sizing Guide",
        href: "/inventory/sizing",
        slot: "gears-sizing",
      },
      // Was four separate entries pointing at #how-it-works, #request, #donate
      // and #gear-drives -- four rows in the menu that all land on the same
      // page. The page's own headings do that job once you are on it.
      { label: "Donate or Request {item_plural}", href: "/inventory/donate" },
    ],
  },
  {
    label: "Get Involved",
    href: "/get-involved",
    slot: "get-involved",
    links: [
      { label: "Ways to Get Involved", href: "/get-involved" },
      { label: "Attend", href: "/get-involved/attend" },
      {
        label: "Volunteer",
        href: "/get-involved/volunteer",
        slot: "get-involved-volunteer",
      },
      { label: "Become a Partner", href: "/get-involved/partner" },
    ],
  },
  {
    label: "Support",
    href: "/support",
    slot: "support",
    links: [
      { label: "Support us", href: "/support" },
      { label: "Donations", href: "/support/donations" },
      { label: "Sponsorship", href: "/support/sponsorship" },
    ],
  },
  { label: "Contact", href: "/contact", slot: "contact" },
] as const;

/**
 * The site's legal notices. These render in the footer's bottom bar, next to
 * the copyright line, rather than mixed into the section links above it --
 * they are utility links, not destinations, and listing them alongside Events
 * and Gear read as if the privacy policy were a fifth part of the site.
 *
 * They are deliberately not NAV_GROUPS entries with slots: a section of the
 * marketing site is shown or hidden, and a legal document is adopted or not,
 * and those are different decisions. Which of these the footer actually renders
 * is the tenant's publication state (`@/lib/legal-publication.ts`), not page
 * visibility -- the privacy policy is always among them.
 *
 * Derived from the registry so the footer, the routes and the admin panel
 * cannot disagree about what the three documents are.
 */
export const LEGAL_LINKS: readonly NavLink[] = LEGAL_DOCUMENTS.map(
  (document) => ({ label: document.label, href: document.route }),
);

/**
 * Drops every group and sub-link belonging to a hidden section, and resolves
 * the lexicon placeholders in what is left. A group is removed when its own
 * slot is hidden, and also when filtering its sub-links leaves it empty --
 * otherwise the board hiding the last page in a group would leave an empty
 * dropdown behind.
 *
 * The lexicon is resolved here rather than at each of the three call sites
 * (the header, the mobile sheet and the footer) because this is the one
 * function all three already go through, and a label that reached a caller
 * unresolved would render braces at them. It defaults to the platform's own
 * words so a caller that has no tenant still gets readable navigation.
 */
export function visibleGroups(
  hidden: readonly string[],
  lexicon: Lexicon = DEFAULT_LEXICON,
): NavGroup[] {
  const isHidden = (slot?: string) => Boolean(slot && hidden.includes(slot));
  const named = <T extends { label: string }>(entry: T): T => ({
    ...entry,
    label: applyLexicon(entry.label, lexicon),
  });

  return NAV_GROUPS.filter((group) => !isHidden(group.slot))
    .map((group) => {
      if (!group.links) return named(group);
      return named({
        ...group,
        links: group.links.filter((l) => !isHidden(l.slot)).map(named),
      });
    })
    .filter((group) => group.links === undefined || group.links.length > 0);
}

/** Whether a section is currently shown, for gating header/in-page CTAs. */
export function isSlotVisible(hidden: readonly string[], slot: string) {
  return !hidden.includes(slot);
}

/**
 * Every section slot a public href sits under, from this tree rather than from
 * a second hand-written mapping -- NAV_GROUPS already records which slot owns
 * which path, and a duplicate of that is exactly the drift the tree was
 * introduced to end.
 *
 * A nested slot matches alongside its parent: `/inventory/sizing` is under both
 * `gears` and `gears-sizing`, and the page is unreachable when either is off.
 * In-page anchors and ungated routes (the legal notices) match nothing.
 */
export function slotsForHref(href: string): string[] {
  const gated = NAV_GROUPS.flatMap((group) => [
    ...(group.slot ? [{ base: group.href, slot: group.slot }] : []),
    ...(group.links ?? []).flatMap((link) =>
      link.slot ? [{ base: link.href, slot: link.slot }] : [],
    ),
  ]);

  return gated
    .filter(({ base }) => href === base || href.startsWith(`${base}/`))
    .map(({ slot }) => slot);
}

/**
 * Whether an in-page link to a public route still goes somewhere. Use it for
 * links written into content -- an article's "further reading", a CTA -- which
 * the nav filter never sees and which 404 once the board hides the section
 * they point into.
 */
export function isHrefVisible(
  hidden: readonly string[],
  href: string,
): boolean {
  return !slotsForHref(href).some((slot) => hidden.includes(slot));
}
