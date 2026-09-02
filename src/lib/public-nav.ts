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

export type NavLink = { label: string; href: string; slot?: string };

export type NavGroup = {
  label: string;
  /**
   * The section's landing page. Used as the footer link and as the mobile
   * sheet's group heading target, so every group is reachable as a whole and
   * not just through its children.
   */
  href: string;
  /**
   * Ties the group to an entry in PUBLIC_PAGE_SLOTS, so a section the board has
   * hidden from Administration > System Settings drops out of the nav and the
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
 * `/about` and `/gears` deliberately have no such entry: both redirect to a
 * child that is already listed (`/about/story`, `/gears/library`), so an
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
    label: "Gear",
    href: "/gears",
    slot: "gears",
    links: [
      { label: "Gear Library", href: "/gears/library" },
      { label: "Sizing Guide", href: "/gears/sizing" },
      // Was four separate entries pointing at #how-it-works, #request, #donate
      // and #gear-drives -- four rows in the menu that all land on the same
      // page. The page's own headings do that job once you are on it.
      { label: "Donate or Request Gear", href: "/gears/donate" },
    ],
  },
  {
    label: "Get Involved",
    href: "/get-involved",
    slot: "get-involved",
    links: [
      { label: "Ways to Get Involved", href: "/get-involved" },
      { label: "Attend", href: "/get-involved/attend" },
      { label: "Volunteer", href: "/get-involved/volunteer" },
      { label: "Become a Partner", href: "/get-involved/partner" },
    ],
  },
  {
    label: "Support",
    href: "/support",
    slot: "support",
    links: [
      { label: "Support Chatter", href: "/support" },
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
 * They are deliberately not NAV_GROUPS entries with slots: they have to stay
 * reachable from every page for as long as the site collects personal
 * information and takes event, volunteer and gear submissions, so they are
 * neither header destinations competing with the sections nor something the
 * board can hide from Administration > System Settings.
 */
export const LEGAL_LINKS: readonly NavLink[] = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Use", href: "/terms" },
  { label: "Code of Conduct", href: "/code-of-conduct" },
] as const;

/**
 * Drops every group and sub-link belonging to a hidden section. A group is
 * removed when its own slot is hidden, and also when filtering its sub-links
 * leaves it empty -- otherwise the board hiding the last page in a group would
 * leave an empty dropdown behind.
 */
export function visibleGroups(hidden: readonly string[]): NavGroup[] {
  const isHidden = (slot?: string) => Boolean(slot && hidden.includes(slot));

  return NAV_GROUPS.filter((group) => !isHidden(group.slot))
    .map((group) => {
      if (!group.links) return group;
      return { ...group, links: group.links.filter((l) => !isHidden(l.slot)) };
    })
    .filter((group) => group.links === undefined || group.links.length > 0);
}

/** Whether a section is currently shown, for gating header/in-page CTAs. */
export function isSlotVisible(hidden: readonly string[], slot: string) {
  return !hidden.includes(slot);
}
