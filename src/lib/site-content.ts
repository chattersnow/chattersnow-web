/**
 * The content model for the public site (#707 Phase 4).
 *
 * Every piece of organization-specific copy on the public site is a *slot*:
 * a key, a page it belongs to, a type, and a default. A tenant with no
 * `site_content` rows renders those defaults, and a provisioned tenant starts
 * from a complete site it rewrites slot by slot from Administration > Site
 * Content rather than from a blank page.
 *
 * The defaults used to be Chatter Snow's copy, because this registry was
 * extracted from its pages. That made a newly provisioned nonprofit's public
 * site another organization's -- its headline, its mission, and, in
 * `about_team.members`, real people's names and biographies. Provisioning
 * deliberately copies no site content, and `org`, `home`, `contact` and
 * `events` carry no visibility gate, so that was public from the moment the
 * tenant existed. Chatter Snow now holds its copy in its own rows (#795
 * rollout step 3) and the defaults are prompts: they read as unwritten, which
 * is the honest thing for a site nobody has written yet to look like.
 *
 * Only the slots that *named or described* an organization were rewritten.
 * "Get in touch" and "Meet the team" are product chrome that happens to live
 * in a slot -- every organization has a contact page and a team -- and
 * replacing them with prompts would make an unwritten site worse rather than
 * more neutral.
 *
 * "Gear library" was filed under that heading too, and that was the wrong line
 * (#896). It is not chrome: it names *what the organization lends*, which is
 * exactly the thing that differs between tenants. So a default may carry a
 * `{term}` placeholder from the lexicon registry in `src/lib/lexicon.ts`, and
 * `resolveSiteContent` resolves it against the tenant's own words -- an
 * organization that has said it runs a tool library does not then have to
 * retype every heading that contains the word. Placeholders are resolved in
 * *defaults only*: a stored value is the tenant's own writing, and a brace in
 * it is a brace they typed.
 *
 * What is deliberately *not* a slot: the sizing tables (Chatter Snow's, gated
 * to that tenant by #831), the form labels and validation messages (product
 * chrome), and the structure of the pages themselves. The legal documents are
 * a special case -- see `document` below.
 *
 * The Learn guides were on that list until #894, described as "generic
 * snow-sports material any organization can publish as-is". That did not hold:
 * `mountain-basics` and `park-riding-safety` are generic *within snow sports*,
 * and this is not a snow-sports platform. They are now a collection of their
 * own -- `article_categories` and `articles`, modelled in
 * `src/lib/articles.ts` -- because a registry of fixed keys cannot hold an
 * unbounded number of rows a tenant creates.
 *
 * The photos are slots too (#812): an `image` slot is the picture that sits
 * beside a section's copy, keyed `site_images.<slot>` and stored in the same
 * table, so it is drafted, published and reverted exactly as the words are.
 * Its default is always null -- the placeholder icon -- and the public site
 * reads them through `getSiteImageUrls()` in `src/lib/site-images.ts`, which
 * strips the prefix; `about_team.members`' `photo_slot` field names the short
 * form for the same reason.
 *
 * This module is imported by the editor, a client component, so it stays
 * free of server-only imports; the database read lives in
 * `src/lib/public-site.ts`.
 */

import { isRenderableImageSrc, resolveImageUrl } from "@/lib/inventory";
import { isPublishableHref } from "@/lib/legal-markup";
import {
  DEFAULT_LEXICON,
  applyLexicon,
  applyLexiconAll,
  type Lexicon,
} from "@/lib/lexicon";

export type ContentPage = {
  key: string;
  label: string;
  /**
   * The page's own route. Several pages span more than one -- Get Involved
   * carries four, Support three -- so this is only where a section that says
   * nothing else renders; `ContentSection.route` is the precise answer.
   */
  route: string;
  /**
   * The `PUBLIC_PAGE_SLOTS` key in `src/lib/page-visibility.ts` that decides
   * whether this page is live, so the editor can say when copy is being
   * written for a page nobody can reach. Unset where nothing gates the page:
   * `org` and `home` are the site itself, and the legal pages deliberately
   * carry no visibility slot (see `src/app/(public)/privacy/layout.tsx`).
   */
  visibilityKey?: string;
};

export const CONTENT_PAGES: readonly ContentPage[] = [
  { key: "org", label: "Organization", route: "/home" },
  { key: "home", label: "Home", route: "/home" },
  {
    key: "about_story",
    label: "About: Our Story",
    route: "/about/story",
    visibilityKey: "about",
  },
  {
    key: "about_mission",
    label: "About: Mission & Values",
    route: "/about/mission",
    visibilityKey: "about",
  },
  {
    key: "about_team",
    label: "About: Meet the Team",
    route: "/about/team",
    visibilityKey: "about",
  },
  { key: "events", label: "Events", route: "/events", visibilityKey: "events" },
  {
    key: "programs",
    label: "Programs",
    route: "/programs",
    visibilityKey: "programs",
  },
  { key: "learn", label: "Learn", route: "/learn", visibilityKey: "learn" },
  {
    key: "gears",
    label: "Gear",
    route: "/inventory/library",
    visibilityKey: "gears",
  },
  {
    key: "get_involved",
    label: "Get Involved",
    route: "/get-involved",
    visibilityKey: "get-involved",
  },
  {
    key: "support",
    label: "Support",
    route: "/support",
    visibilityKey: "support",
  },
  {
    key: "contact",
    label: "Contact",
    route: "/contact",
    visibilityKey: "contact",
  },
  { key: "brand", label: "Brand", route: "/brand", visibilityKey: "brand" },
  { key: "links", label: "Links", route: "/links", visibilityKey: "links" },
  { key: "legal", label: "Legal documents", route: "/privacy" },
] as const;

/**
 * A group of slots that read as one thing on the page -- a heading and the
 * body under it, a card and its list. The 86 slots are not a flat list to
 * anyone editing them: `get_involved` is six sections of heading-plus-body,
 * and rendering them as fifteen siblings left the pairing to be inferred from
 * adjacent labels (#792).
 *
 * `route` matters as much as the grouping. `ContentPage.route` is one route
 * per page, but four pages span several -- Get Involved's slots render across
 * `/get-involved`, `/get-involved/attend`, `/get-involved/partner` and
 * `/get-involved/volunteer` -- so a single "view on the site" link pointed at
 * the wrong page for most of them. Every route below was read off the public
 * page that actually reads the slot.
 */
export type ContentSection = {
  key: string;
  page: string;
  label: string;
  description?: string;
  /** Where this section renders, when it is not the page's own route. */
  route?: string;
};

export const CONTENT_SECTIONS: readonly ContentSection[] = [
  {
    key: "org:identity",
    page: "org",
    label: "Identity",
    description: "How the organization names and describes itself site-wide.",
  },
  {
    key: "org:contact",
    page: "org",
    label: "Contact details",
    description: "The addresses and handles published in the footer.",
    route: "/contact",
  },

  { key: "home:hero", page: "home", label: "Hero" },
  {
    key: "home:next_event",
    page: "home",
    label: "Upcoming events",
    description:
      "The heading over the upcoming events on the homepage, the link through to the full events listing, and the ribbon on the soonest one. When nothing of your own is upcoming, the ribbon labels the next community calendar item instead.",
  },

  { key: "about_story:opening", page: "about_story", label: "Opening" },
  { key: "about_story:story", page: "about_story", label: "Our story" },

  { key: "about_mission:mission", page: "about_mission", label: "Mission" },
  { key: "about_mission:values", page: "about_mission", label: "Values" },
  { key: "about_mission:why", page: "about_mission", label: "Why we exist" },

  { key: "about_team:team", page: "about_team", label: "The team" },

  { key: "events:listing", page: "events", label: "Events listing" },
  {
    key: "events:community",
    page: "events",
    label: "Community calendar",
    route: "/events/community",
  },

  { key: "programs:opening", page: "programs", label: "Opening" },
  { key: "programs:pillars", page: "programs", label: "Pillars" },
  { key: "programs:items", page: "programs", label: "Programs" },

  { key: "learn:opening", page: "learn", label: "Opening" },

  { key: "gears:library", page: "gears", label: "Gear library" },
  {
    key: "gears:donate",
    page: "gears",
    label: "How donating works",
    route: "/inventory/donate",
  },
  {
    key: "gears:request",
    page: "gears",
    label: "Requesting gear",
    route: "/inventory/donate",
  },
  {
    key: "gears:accept",
    page: "gears",
    label: "What we accept",
    route: "/inventory/donate",
  },
  {
    key: "gears:drives",
    page: "gears",
    label: "Gear drives",
    route: "/inventory/donate",
  },

  { key: "get_involved:opening", page: "get_involved", label: "Opening" },
  { key: "get_involved:sponsor", page: "get_involved", label: "Sponsor" },
  { key: "get_involved:gear", page: "get_involved", label: "Donate gear" },
  {
    key: "get_involved:attend",
    page: "get_involved",
    label: "Attend",
    route: "/get-involved/attend",
  },
  {
    key: "get_involved:community",
    page: "get_involved",
    label: "Community",
    route: "/get-involved/attend",
  },
  {
    key: "get_involved:partner",
    page: "get_involved",
    label: "Partner",
    route: "/get-involved/partner",
  },
  {
    key: "get_involved:volunteer",
    page: "get_involved",
    label: "Volunteer",
    route: "/get-involved/volunteer",
  },

  { key: "support:opening", page: "support", label: "Opening" },
  {
    key: "support:donations",
    page: "support",
    label: "Donations",
    route: "/support/donations",
  },
  {
    key: "support:sponsorship",
    page: "support",
    label: "Sponsorship",
    route: "/support/sponsorship",
  },

  { key: "contact:opening", page: "contact", label: "Opening" },

  {
    key: "brand:opening",
    page: "brand",
    label: "Opening",
    description:
      "The introduction to the brand guide. Everything below it on the page -- the palette, the accent gradient, the logo and the type specimens -- is read from the colours and copy set elsewhere in Administration and is not edited here.",
  },
  {
    key: "brand:usage",
    page: "brand",
    label: "Usage",
    description:
      "The judgements a palette cannot express: how the organization talks, how its name is written, and what may and may not be done to the logo.",
  },

  {
    key: "links:page",
    page: "links",
    label: "Links",
    description:
      "The page a social profile's single bio link points at. Everything here is a whole page of its own -- it is not shown in the site's navigation, so the only way anyone reaches it is the link you publish.",
  },

  {
    key: "legal:documents",
    page: "legal",
    label: "Documents",
    description:
      "The text of each document. Whether it is served at all is a separate decision, in Administration > System Settings > Legal documents: the terms and the code of conduct are published once your organization has adopted them, and the privacy policy always is (#859).",
  },
] as const;

type ListFieldBase = {
  key: string;
  label: string;
  /** Left blank in the editor when unset; a text field is otherwise required. */
  optional?: boolean;
};

/**
 * A `photo` field: the one control a row's picture is set from.
 *
 * The field stores a URL, and the image slot it may point at instead lives in
 * a *sibling* field, because the site's precedence -- the row's own URL, then
 * the slot it names, then a shared fallback -- is load-bearing for a tenant
 * who set a link directly. Those two used to be asked as two independent
 * free-text boxes, with the precedence documented nowhere near them and the
 * slot name typed by hand: a typo fell through to the fallback silently, and
 * neither box previewed anything (#922).
 */
export type PhotoListField = ListFieldBase & {
  kind: "photo";
  /** The sibling field holding the chosen image slot's short name. */
  slotField: string;
  /**
   * Image slots whose short name starts with this are the choices offered.
   * The registry is the source of truth for those names, so the editor can
   * offer a select over real slots rather than a box to mistype one into.
   */
  slotPrefix: string;
  /** The image slot used when the row names neither a URL nor a slot. */
  fallbackSlot: string;
  /** The aspect the public site crops the photo to, as a CSS ratio. */
  ratio: string;
};

export type ListField =
  | (ListFieldBase & {
      /**
       * `url` is a text field the editor offers as a URL box and that
       * `isPublishableHref()` has to accept, so a destination an editor typed
       * wrong -- or a scheme nobody should be able to publish -- is refused on
       * the way in rather than rendered as an `href` on a public page (#937).
       *
       * `boolean` is a switch. It exists because a list whose rows are *shown
       * or hidden* rather than added and removed has no way to say so
       * otherwise, and deleting a row to hide it for a month is not the same
       * thing.
       */
      kind: "text" | "paragraphs" | "url" | "boolean";
    })
  | PhotoListField;

export type ListItem = Record<string, string | string[] | boolean>;

/** One section of a structured legal document. */
export type LegalDocumentSection = {
  id: string;
  title: string;
  paragraphs: string[];
};

/**
 * A whole legal page as data: the shape `LegalPageShell` renders.
 *
 * Both kinds of document are this shape since #858 -- the platform's neutral
 * default, built in `src/lib/legal-defaults.ts`, and whatever a tenant
 * publishes in its place. Paragraphs may carry the small markup
 * `src/lib/legal-markup.ts` parses: bullets, links and bold, and nothing else.
 */
export type LegalDocumentContent = {
  title: string;
  last_updated: string;
  summary: string[];
  sections: LegalDocumentSection[];
};

/**
 * The shape of the platform's own document: its title and the headings it is
 * organized under, in order.
 *
 * `src/lib/legal-defaults.ts` writes one block of prose per id here and refuses
 * to build a document if the two lists disagree, so the outline the Site
 * Content editor offers and the document the site serves cannot drift (#792).
 * It lives here rather than beside the prose because the editor is a client
 * component that needs the headings without the text.
 *
 * The questions a document has to answer are only the ones the platform can
 * answer for any organization (#858). Snow-sports risk, the gear library, what
 * happens on the mountain and a specific governing law were all headings here
 * while these were Chatter Snow's documents; they are now sections of Chatter
 * Snow's own published document rather than of the platform's default.
 */
export type LegalDocumentOutline = {
  title: string;
  sections: readonly { id: string; title: string }[];
};

export const LEGAL_DOCUMENT_OUTLINES: Record<string, LegalDocumentOutline> = {
  "legal.privacy": {
    title: "Privacy Policy",
    sections: [
      { id: "what-we-collect", title: "What we collect, and why" },
      { id: "what-we-dont-do", title: "What we don’t do" },
      { id: "how-long-we-keep-it", title: "How long we keep it" },
      { id: "who-can-see-it", title: "Who can see it" },
      { id: "how-we-protect-it", title: "How we protect it" },
      { id: "cookies-and-analytics", title: "Cookies and analytics" },
      { id: "other-sites", title: "Other sites we link to" },
      { id: "your-choices", title: "Your choices" },
      { id: "minors", title: "Minors" },
      { id: "changes", title: "Changes to this policy" },
      { id: "contact", title: "Contact" },
    ],
  },
  "legal.terms": {
    title: "Terms of Use",
    sections: [
      { id: "who-we-are", title: "Who we are" },
      { id: "using-this-site", title: "Using this site" },
      { id: "events-and-programs", title: "Events and programs" },
      { id: "volunteering", title: "Volunteering" },
      {
        id: "accessibility-and-inclusion",
        title: "Accessibility and inclusion",
      },
      { id: "educational-content", title: "Educational content" },
      { id: "donations-and-payments", title: "Donations and payments" },
      { id: "photos-and-content", title: "Photos, video and what you send us" },
      { id: "other-sites-and-venues", title: "Other websites and venues" },
      { id: "other-agreements", title: "Other agreements" },
      { id: "no-warranties", title: "No warranties" },
      { id: "limitation-of-liability", title: "Limits on liability" },
      { id: "indemnification", title: "Your responsibility to us" },
      { id: "changes", title: "Changes to these terms" },
      { id: "severability", title: "Severability" },
      { id: "contact", title: "Contact" },
    ],
  },
  "legal.code_of_conduct": {
    title: "Code of Conduct",
    sections: [
      { id: "what-we-expect", title: "What we expect" },
      { id: "what-isnt-tolerated", title: "What isn’t tolerated" },
      { id: "reporting-a-problem", title: "Reporting a problem" },
      { id: "how-we-handle-a-report", title: "How we handle a report" },
      { id: "if-you-disagree", title: "If you disagree with a decision" },
      { id: "questions", title: "Questions" },
    ],
  },
};

type SlotBase = {
  key: string;
  page: string;
  /** A `CONTENT_SECTIONS` key. Required, so no slot falls outside the grouping. */
  section: string;
  label: string;
  description?: string;
};

export type ContentSlot = SlotBase &
  (
    | { type: "text"; default: string }
    | { type: "paragraphs"; default: string[] }
    | { type: "list"; fields: readonly ListField[]; default: ListItem[] }
    | { type: "document"; default: null; route: string }
    /**
     * A Google Drive share link or image URL; null is the placeholder icon.
     *
     * `ratio` is the aspect the public site crops this photo to -- "21/9" for
     * a hero strip, "3/4" for the portrait beside Our Story. The editor's
     * preview is drawn at it, because a square thumbnail cannot show whether
     * the heads come off in a 21:9 band (#918).
     */
    | { type: "image"; default: null; ratio: string }
  );

const BULLET: readonly ListField[] = [
  { key: "text", label: "Item", kind: "text" },
];

/**
 * The photo a team member on the Meet the Team page shows.
 *
 * Named rather than inlined in the slot below because the public page imports
 * it too: it resolves a member's picture with `resolvePhoto()`, the same call
 * the editor's preview makes, so the two cannot disagree about which source
 * wins (#922).
 */
export const TEAM_PHOTO_FIELD: PhotoListField = {
  key: "photo_url",
  label: "Photo",
  kind: "photo",
  optional: true,
  slotField: "photo_slot",
  slotPrefix: "about_team_photo_",
  fallbackSlot: "about_team_photo",
  ratio: "1/1",
};

/** The `app_settings`-era prefix every image slot key still carries, so `public_site_images` can strip it. */
export const IMAGE_SLOT_KEY_PREFIX = "site_images.";

/** The short name a page looks an image up by: `site_images.learn_photo` -> `learn_photo`. */
export function imageSlotName(key: string): string {
  return key.startsWith(IMAGE_SLOT_KEY_PREFIX)
    ? key.slice(IMAGE_SLOT_KEY_PREFIX.length)
    : key;
}

function image(
  name: string,
  page: string,
  section: string,
  label: string,
  description: string,
  /** The aspect the public site crops it to, as a CSS ratio: "21/9", "1/1". */
  ratio: string,
): ContentSlot {
  return {
    key: `${IMAGE_SLOT_KEY_PREFIX}${name}`,
    page,
    section,
    label,
    description,
    type: "image",
    default: null,
    ratio,
  };
}

export const SITE_CONTENT_SLOTS: readonly ContentSlot[] = [
  // Organization --------------------------------------------------------------
  {
    key: "org.short_name",
    page: "org",
    section: "org:identity",
    label: "Short name",
    description:
      "How the organization refers to itself mid-sentence. The full name comes from the organization's record.",
    type: "text",
    default: "Your organization",
  },
  {
    key: "org.tagline",
    page: "org",
    section: "org:identity",
    label: "Site description",
    description:
      "The one-sentence description search engines and link previews show.",
    type: "text",
    default: "A short line describing what your organization does",
  },
  {
    key: "org.image_alt",
    page: "org",
    section: "org:identity",
    label: "Photo description",
    description:
      "The text a screen reader announces for the community photos across the site.",
    type: "text",
    default: "Community members",
  },
  {
    key: "org.email_general",
    page: "org",
    section: "org:contact",
    label: "General email",
    description: "Where the contact page and the footer point.",
    type: "text",
    default: "hello@example.org",
  },
  {
    key: "org.email_privacy",
    page: "org",
    section: "org:contact",
    label: "Privacy email",
    description: "Access, correction and deletion requests.",
    type: "text",
    default: "privacy@example.org",
  },
  {
    key: "org.email_conduct",
    page: "org",
    section: "org:contact",
    label: "Conduct email",
    description: "Code of conduct reports.",
    type: "text",
    default: "conduct@example.org",
  },
  {
    key: "org.instagram_handle",
    page: "org",
    section: "org:contact",
    label: "Instagram handle",
    description: "Without the @. Leave blank to hide the Instagram links.",
    type: "text",
    default: "",
  },
  {
    key: "org.footer_contact_eyebrow",
    page: "org",
    section: "org:contact",
    label: "Footer contact heading",
    type: "text",
    default: "Get in touch",
  },

  // Home ----------------------------------------------------------------------
  {
    key: "home.heading",
    page: "home",
    section: "home:hero",
    label: "Heading",
    type: "text",
    default: "Your headline goes here",
  },
  {
    key: "home.intro",
    page: "home",
    section: "home:hero",
    label: "Introduction",
    type: "text",
    default:
      "A sentence or two introducing your organization and what it does.",
  },
  {
    key: "home.cta_events",
    page: "home",
    section: "home:hero",
    label: "Events button",
    type: "text",
    default: "Join an event",
  },
  {
    key: "home.cta_get_involved",
    page: "home",
    section: "home:hero",
    label: "Get involved button",
    type: "text",
    default: "Get involved",
  },
  {
    key: "home.cta_donate",
    page: "home",
    section: "home:hero",
    label: "Donate button",
    description: "Shown only while the Support section is visible.",
    type: "text",
    default: "Donate",
  },
  {
    key: "home.upcoming_eyebrow",
    page: "home",
    section: "home:next_event",
    label: "Section label",
    description: "The small label above the Upcoming events heading.",
    type: "text",
    default: "On the calendar",
  },
  {
    key: "home.upcoming_heading",
    page: "home",
    section: "home:next_event",
    label: "Heading",
    type: "text",
    default: "Upcoming events",
  },
  {
    key: "home.upcoming_cta",
    page: "home",
    section: "home:next_event",
    label: "Link to all events",
    type: "text",
    default: "See all events",
  },
  {
    key: "home.next_event_eyebrow",
    page: "home",
    section: "home:next_event",
    label: "Soonest event ribbon",
    description:
      "The ribbon on the first card. Also labels the community calendar item shown when nothing of your own is upcoming.",
    type: "text",
    default: "Next up",
  },
  image(
    "home_carousel_1",
    "home",
    "home:hero",
    "Homepage carousel — slide 1",
    "First slide of the homepage image carousel.",
    "21/9",
  ),
  image(
    "home_carousel_2",
    "home",
    "home:hero",
    "Homepage carousel — slide 2",
    "Second slide of the homepage image carousel.",
    "21/9",
  ),
  image(
    "home_carousel_3",
    "home",
    "home:hero",
    "Homepage carousel — slide 3",
    "Third slide of the homepage image carousel.",
    "21/9",
  ),

  // About: Our Story ------------------------------------------------------------
  {
    key: "about_story.heading",
    page: "about_story",
    section: "about_story:opening",
    label: "Heading",
    type: "text",
    default: "About us",
  },
  {
    key: "about_story.intro",
    page: "about_story",
    section: "about_story:opening",
    label: "Introduction",
    type: "paragraphs",
    default: [
      "Introduce your organization here — this is the first thing visitors read on your About page.",
    ],
  },
  {
    key: "about_story.section_heading",
    page: "about_story",
    section: "about_story:story",
    label: "Story heading",
    type: "text",
    default: "Our Story",
  },
  {
    key: "about_story.body",
    page: "about_story",
    section: "about_story:story",
    label: "Story",
    type: "paragraphs",
    default: [
      "Tell your organization's story: how it started, who it is for, and where it is going.",
    ],
  },
  image(
    "about_story_photo",
    "about_story",
    "about_story:story",
    "Our Story photo",
    "Photo alongside the Our Story section on the About page.",
    "3/4",
  ),

  // About: Mission & Values ------------------------------------------------------
  {
    key: "about_mission.heading",
    page: "about_mission",
    section: "about_mission:mission",
    label: "Heading",
    type: "text",
    default: "Our Mission",
  },
  {
    key: "about_mission.statement",
    page: "about_mission",
    section: "about_mission:mission",
    label: "Mission statement",
    description: "Shown in quotation marks.",
    type: "text",
    default: "Your mission statement goes here.",
  },
  {
    key: "about_mission.lead_in",
    page: "about_mission",
    section: "about_mission:mission",
    label: "Lead-in to the list",
    type: "text",
    default: "Introduce the list of what your organization does.",
  },
  {
    key: "about_mission.points",
    page: "about_mission",
    section: "about_mission:mission",
    label: "How we do it",
    type: "list",
    fields: BULLET,
    default: [{ text: "Something your organization does" }],
  },
  {
    key: "about_mission.closing",
    page: "about_mission",
    section: "about_mission:mission",
    label: "Closing line",
    type: "text",
    default: "A closing line for your mission page.",
  },
  {
    key: "about_mission.values_heading",
    page: "about_mission",
    section: "about_mission:values",
    label: "Values heading",
    type: "text",
    default: "Our Values",
  },
  {
    key: "about_mission.values",
    page: "about_mission",
    section: "about_mission:values",
    label: "Values",
    type: "list",
    fields: [
      { key: "name", label: "Value", kind: "text" },
      { key: "description", label: "Description", kind: "text" },
    ],
    default: [
      {
        name: "Value name",
        description: "What this value means in your organization's work.",
      },
    ],
  },
  {
    key: "about_mission.why_heading",
    page: "about_mission",
    section: "about_mission:why",
    label: "Why heading",
    type: "text",
    default: "Why this work matters",
  },
  {
    key: "about_mission.why_body",
    page: "about_mission",
    section: "about_mission:why",
    label: "Why",
    type: "paragraphs",
    default: ["Explain why your organization exists, and who it is for."],
  },
  image(
    "about_mission_photo",
    "about_mission",
    "about_mission:values",
    "Our Mission photo",
    "Photo alongside the Our Values section on the Mission page.",
    "1/1",
  ),
  image(
    "about_mission_bottom_photo",
    "about_mission",
    "about_mission:why",
    "Mission page — bottom photo",
    "Photo shown at the bottom of the Mission page, below the Why LGBTQ+ Snow Sports section.",
    "16/9",
  ),

  // About: Meet the Team ---------------------------------------------------------
  {
    key: "about_team.heading",
    page: "about_team",
    section: "about_team:team",
    label: "Heading",
    type: "text",
    default: "Meet the team",
  },
  // The order inside a section is the order the editor renders it in, so it
  // follows the page: heading, the strip under it, then the member cards. It
  // used to sit below "Missing bio text", four fields away from the heading it
  // is glued to on the site (#918).
  image(
    "about_team_hero_photo",
    "about_team",
    "about_team:team",
    "Meet the Team — top photo",
    "Photo between the Meet the Team heading and the team member cards.",
    "21/9",
  ),
  {
    key: "about_team.members",
    page: "about_team",
    section: "about_team:team",
    label: "Team members",
    type: "list",
    fields: [
      { key: "name", label: "Name", kind: "text" },
      TEAM_PHOTO_FIELD,
      // Declared so the row's shape is validated and a new row carries the
      // key, but never rendered on its own: the `photo` field above owns it,
      // and the editor skips any field another field claims as its
      // `slotField`.
      {
        key: "photo_slot",
        label: "Image slot",
        kind: "text",
        optional: true,
      },
      { key: "bio", label: "Bio", kind: "paragraphs", optional: true },
    ],
    default: [
      {
        name: "Team member name",
        photo_url: "",
        photo_slot: "",
        bio: ["A short biography."],
      },
    ],
  },
  image(
    "about_team_photo_cass",
    "about_team",
    "about_team:team",
    "Team photo — Cass Lainez",
    "Cass Lainez's photo on the Meet the Team page, chosen in a team member's Photo field.",
    "1/1",
  ),
  image(
    "about_team_photo_rickie",
    "about_team",
    "about_team:team",
    "Team photo — Rickie Cruz",
    "Rickie Cruz's photo on the Meet the Team page, chosen in a team member's Photo field.",
    "1/1",
  ),
  image(
    "about_team_photo_sofie",
    "about_team",
    "about_team:team",
    "Team photo — Sofie Chavez",
    "Sofie Chavez's photo on the Meet the Team page, chosen in a team member's Photo field.",
    "1/1",
  ),
  image(
    "about_team_photo",
    "about_team",
    "about_team:team",
    "Team member photo",
    "Shown for any team member who doesn't have their own photo.",
    "1/1",
  ),
  {
    key: "about_team.bio_placeholder",
    page: "about_team",
    section: "about_team:team",
    label: "Missing bio text",
    type: "text",
    default: "Bio coming soon.",
  },

  // Events ----------------------------------------------------------------------
  {
    key: "events.heading",
    page: "events",
    section: "events:listing",
    label: "Events heading",
    type: "text",
    default: "Upcoming & past events",
  },
  {
    key: "events.intro",
    page: "events",
    section: "events:listing",
    label: "Events introduction",
    type: "text",
    default: "Browse upcoming and past events.",
  },
  {
    key: "events.community_heading",
    page: "events",
    section: "events:community",
    label: "Community calendar heading",
    type: "text",
    default: "Community Calendar",
  },
  {
    key: "events.community_intro",
    page: "events",
    section: "events:community",
    label: "Community calendar introduction",
    type: "text",
    default:
      "Community observances, seasonal moments, campaigns, and our own events, all in one place. Not everything listed here is hosted or organized by us.",
  },

  // Programs --------------------------------------------------------------------
  {
    key: "programs.heading",
    page: "programs",
    section: "programs:opening",
    label: "Heading",
    type: "text",
    default: "Programs",
  },
  {
    key: "programs.intro",
    page: "programs",
    section: "programs:opening",
    label: "Introduction",
    type: "text",
    default: "A line introducing your programs.",
  },
  {
    key: "programs.pillars",
    page: "programs",
    section: "programs:pillars",
    label: "Pillars",
    description: "The groups programs are listed under, in order.",
    type: "list",
    fields: [
      { key: "label", label: "Pillar", kind: "text" },
      { key: "description", label: "Tagline", kind: "text" },
    ],
    default: [
      {
        label: "Pillar name",
        description: "What this group of programs is for.",
      },
    ],
  },
  {
    // Read only when the Programs page is drawing its cards from the Programs
    // module (#898) and the tenant has marked none of them public. In Site
    // Content mode the list below is the page, and an empty one is an empty
    // list nobody wrote -- there is nothing to say about it.
    key: "programs.empty",
    page: "programs",
    section: "programs:items",
    label: "No programs text",
    description:
      "Shown when the page reads the Programs module and no program is marked for the public site.",
    type: "text",
    default: "Programs are being finalized. Check back soon.",
  },
  {
    key: "programs.items",
    page: "programs",
    section: "programs:items",
    label: "Programs",
    description: "Each program names the pillar it belongs under.",
    type: "list",
    fields: [
      { key: "pillar", label: "Pillar", kind: "text" },
      { key: "emoji", label: "Emoji", kind: "text", optional: true },
      { key: "name", label: "Program", kind: "text" },
      { key: "description", label: "Description", kind: "text" },
    ],
    default: [
      {
        pillar: "Pillar name",
        emoji: "",
        name: "Program name",
        description: "What this program offers, and who it is for.",
      },
    ],
  },

  // Learn -----------------------------------------------------------------------
  {
    key: "learn.heading",
    page: "learn",
    section: "learn:opening",
    label: "Heading",
    type: "text",
    default: "Learn",
  },
  {
    key: "learn.intro",
    page: "learn",
    section: "learn:opening",
    label: "Introduction",
    description: "A link to the sizing guide follows it.",
    type: "text",
    default:
      "Snow sports 101 — orientation basics for anyone new to skiing or riding. Looking for equipment size charts specifically? Check the",
  },
  image(
    "learn_photo",
    "learn",
    "learn:opening",
    "Learn section photo",
    "Photo shown at the bottom of every Learn page (the Learn index and each category page).",
    "21/9",
  ),

  // Gear ------------------------------------------------------------------------
  {
    key: "gears.library_heading",
    page: "gears",
    section: "gears:library",
    label: "Library heading",
    type: "text",
    default: "{collection_public}",
  },
  {
    key: "gears.library_intro",
    page: "gears",
    section: "gears:library",
    label: "Library introduction",
    type: "text",
    default: "Browse {item_plural:lower} currently available to the community.",
  },
  {
    key: "gears.donate_heading",
    page: "gears",
    section: "gears:donate",
    label: "How it works heading",
    type: "text",
    default: "How the {collection_public:lower} works",
  },
  {
    key: "gears.donate_intro",
    page: "gears",
    section: "gears:donate",
    label: "How it works",
    type: "text",
    default:
      "Describe how your {collection_public:lower} works: what you collect, who can borrow it, and how a request is fulfilled.",
  },
  {
    key: "gears.request_heading",
    page: "gears",
    section: "gears:request",
    label: "Request heading",
    type: "text",
    default: "Don't see what you need?",
  },
  {
    key: "gears.request_body",
    page: "gears",
    section: "gears:request",
    label: "Request",
    type: "text",
    default:
      "If your size or item isn't currently in the {collection_public:lower}, send us a message and we'll do our best to match you with available {item_plural:lower}.",
  },
  {
    key: "gears.accept_heading",
    page: "gears",
    section: "gears:accept",
    label: "Donate heading",
    type: "text",
    default: "Donate {item_plural:lower}",
  },
  {
    key: "gears.accept_title",
    page: "gears",
    section: "gears:accept",
    label: "What we accept",
    type: "text",
    default: "We accept gently used {item_plural:lower}",
  },
  {
    key: "gears.accept_items",
    page: "gears",
    section: "gears:accept",
    label: "Accepted items",
    type: "list",
    fields: BULLET,
    default: [{ text: "A kind of {item:lower} you accept" }],
  },
  {
    key: "gears.dropoff_body",
    page: "gears",
    section: "gears:accept",
    label: "How to drop off",
    type: "text",
    default:
      "Drop {item_plural:lower} off in person at any event, or contact us to arrange a drop-off, mail-in, or collection.",
  },
  {
    key: "gears.drives_heading",
    page: "gears",
    section: "gears:drives",
    label: "Gear drives heading",
    type: "text",
    default: "Donation drives",
  },
  {
    key: "gears.drives_body",
    page: "gears",
    section: "gears:drives",
    label: "Gear drives",
    description: "A link to Events follows it.",
    type: "text",
    default:
      "We periodically run donation drives and swap events where the community can donate, trade, and pick up {item_plural:lower} in person. See",
  },
  image(
    "gear_placeholder",
    "gears",
    "gears:library",
    "Gear placeholder",
    "Shown in the gear library for any gear item that doesn't have its own photo.",
    "1/1",
  ),
  image(
    "gears_donate_photo",
    "gears",
    "gears:donate",
    "Donate gear page photo",
    "Photo on the Donate Gear page.",
    "1/1",
  ),
  image(
    "gears_donate_bottom_photo",
    "gears",
    "gears:drives",
    "Donate gear page — bottom photo",
    "Photo at the bottom of the Donate Gear page, below Gear drives.",
    "16/9",
  ),

  // Get involved ----------------------------------------------------------------
  {
    key: "get_involved.heading",
    page: "get_involved",
    section: "get_involved:opening",
    label: "Heading",
    type: "text",
    default: "Get involved",
  },
  {
    key: "get_involved.intro",
    page: "get_involved",
    section: "get_involved:opening",
    label: "Introduction",
    type: "text",
    default: "A line introducing the ways people can get involved.",
  },
  {
    key: "get_involved.sponsor_heading",
    page: "get_involved",
    section: "get_involved:sponsor",
    label: "Sponsor heading",
    type: "text",
    default: "Sponsor us",
  },
  {
    key: "get_involved.sponsor_body",
    page: "get_involved",
    section: "get_involved:sponsor",
    label: "Sponsor",
    type: "text",
    default:
      "Sponsorships help fund events, {item_plural:lower}, and programs.",
  },
  {
    key: "get_involved.gear_heading",
    page: "get_involved",
    section: "get_involved:gear",
    label: "Donate gear heading",
    type: "text",
    default: "Donate {item_plural:lower}",
  },
  {
    key: "get_involved.gear_body",
    page: "get_involved",
    section: "get_involved:gear",
    label: "Donate gear",
    description: "A link to the Gear page follows it.",
    type: "text",
    default:
      "Have {item_plural:lower} you're not using? Donating them helps someone in the community take part. See what we accept on our",
  },
  {
    key: "get_involved.attend_heading",
    page: "get_involved",
    section: "get_involved:attend",
    label: "Attend heading",
    type: "text",
    default: "Attend",
  },
  {
    key: "get_involved.attend_body",
    page: "get_involved",
    section: "get_involved:attend",
    label: "Attend",
    type: "text",
    default:
      "The easiest way to get involved is to show up. Browse upcoming mountain days and community meetups and come ride with us.",
  },
  {
    key: "get_involved.community_heading",
    page: "get_involved",
    section: "get_involved:community",
    label: "Community heading",
    type: "text",
    default: "Join the community",
  },
  {
    key: "get_involved.community_body",
    page: "get_involved",
    section: "get_involved:community",
    label: "Community",
    description: "The Instagram handle follows it.",
    type: "text",
    default:
      "Follow along, meet other members, and hear about events first on Instagram",
  },
  {
    key: "get_involved.partner_heading",
    page: "get_involved",
    section: "get_involved:partner",
    label: "Partner heading",
    type: "text",
    default: "Become a partner",
  },
  {
    key: "get_involved.partner_body",
    page: "get_involved",
    section: "get_involved:partner",
    label: "Partner",
    type: "text",
    default:
      "Describe the organizations you work with and what a partnership can look like.",
  },
  {
    key: "get_involved.volunteer_heading",
    page: "get_involved",
    section: "get_involved:volunteer",
    label: "Volunteer heading",
    type: "text",
    default: "Volunteer",
  },
  {
    key: "get_involved.volunteer_intro",
    page: "get_involved",
    section: "get_involved:volunteer",
    label: "Volunteer introduction",
    type: "text",
    default:
      "We run on volunteers. Here are some of the ways you can get involved.",
  },
  {
    key: "get_involved.volunteer_empty",
    page: "get_involved",
    section: "get_involved:volunteer",
    label: "No open roles text",
    type: "text",
    default: "Check back soon for open volunteer roles.",
  },
  image(
    "get_involved_hero_1",
    "get_involved",
    "get_involved:opening",
    "Get Involved — hero image 1",
    "Large hero image at the top of the Get Involved page.",
    "4/3",
  ),
  image(
    "get_involved_hero_2",
    "get_involved",
    "get_involved:opening",
    "Get Involved — hero image 2",
    "Small hero image at the top of the Get Involved page.",
    "1/1",
  ),
  image(
    "get_involved_hero_3",
    "get_involved",
    "get_involved:opening",
    "Get Involved — hero image 3",
    "Small hero image at the top of the Get Involved page.",
    "1/1",
  ),
  image(
    "get_involved_attend_photo",
    "get_involved",
    "get_involved:attend",
    "Attend page photo",
    "Photo on the Attend page.",
    "4/3",
  ),
  image(
    "get_involved_community_photo",
    "get_involved",
    "get_involved:community",
    "Attend page — community photo",
    "Photo alongside the Join the Community section on the Attend page.",
    "4/3",
  ),
  image(
    "get_involved_partner_photo",
    "get_involved",
    "get_involved:partner",
    "Partner page photo",
    "Photo on the Become a Partner page.",
    "21/9",
  ),
  image(
    "get_involved_volunteer_photo",
    "get_involved",
    "get_involved:volunteer",
    "Volunteer page photo",
    "Photo on the Volunteer page.",
    "21/9",
  ),

  // Support ---------------------------------------------------------------------
  {
    key: "support.heading",
    page: "support",
    section: "support:opening",
    label: "Heading",
    type: "text",
    default: "Support us",
  },
  {
    key: "support.intro",
    page: "support",
    section: "support:opening",
    label: "Introduction",
    type: "text",
    default:
      "Describe what donations, sponsorships, and in-kind support make possible.",
  },
  {
    key: "support.donations_card",
    page: "support",
    section: "support:opening",
    label: "Donations card",
    type: "text",
    default: "Support us with a monetary or in-kind donation.",
  },
  {
    key: "support.sponsorship_card",
    page: "support",
    section: "support:opening",
    label: "Sponsorship card",
    type: "text",
    default: "Partner with us through cash, in-kind, or combined support.",
  },
  {
    key: "support.donations_heading",
    page: "support",
    section: "support:donations",
    label: "Donations heading",
    type: "text",
    default: "Donations",
  },
  {
    key: "support.donations_intro",
    page: "support",
    section: "support:donations",
    label: "Donations introduction",
    type: "text",
    default: "Explain what donations pay for.",
  },
  {
    key: "support.monetary_title",
    page: "support",
    section: "support:donations",
    label: "Monetary donations title",
    type: "text",
    default: "Monetary donations",
  },
  {
    key: "support.monetary_body",
    page: "support",
    section: "support:donations",
    label: "Monetary donations",
    type: "text",
    default:
      "Describe how people can give money, or say that online giving is coming soon.",
  },
  {
    key: "support.inkind_title",
    page: "support",
    section: "support:donations",
    label: "In-kind donations title",
    type: "text",
    default: "In-kind donations",
  },
  {
    key: "support.inkind_body",
    page: "support",
    section: "support:donations",
    label: "In-kind donations",
    description: "A link to the Gear page follows it.",
    type: "text",
    default:
      "We accept gently used {item_plural:lower}, which we redistribute through our {collection_public:lower}. See what we accept and how to donate on our",
  },
  {
    key: "support.sponsorship_heading",
    page: "support",
    section: "support:sponsorship",
    label: "Sponsorship heading",
    type: "text",
    default: "Sponsorship",
  },
  {
    key: "support.sponsorship_intro",
    page: "support",
    section: "support:sponsorship",
    label: "Sponsorship introduction",
    type: "text",
    default:
      "Explain what sponsorship funds, and what a sponsor gets in return.",
  },
  {
    key: "support.sponsorship_tiers",
    page: "support",
    section: "support:sponsorship",
    label: "Sponsorship options",
    type: "list",
    fields: [
      { key: "name", label: "Option", kind: "text" },
      { key: "description", label: "Description", kind: "text" },
    ],
    default: [
      {
        name: "Sponsorship option",
        description: "What this option involves, and what it supports.",
      },
    ],
  },
  {
    key: "support.sponsorship_cta",
    page: "support",
    section: "support:sponsorship",
    label: "Sponsorship button",
    type: "text",
    default: "Talk to us about sponsoring",
  },
  {
    key: "support.sponsor_wall_heading",
    page: "support",
    section: "support:sponsorship",
    label: "Sponsor wall heading",
    type: "text",
    default: "Past sponsors",
    description:
      "Heads the logos of everyone your organization has publicly credited as a sponsor. The wall itself is not edited here -- it is every sponsor marked public on a published event, so it keeps itself current.",
  },
  {
    key: "support.sponsor_wall_intro",
    page: "support",
    section: "support:sponsorship",
    label: "Sponsor wall introduction",
    type: "text",
    default: "Organizations that have supported our events.",
  },
  image(
    "donations_photo",
    "support",
    "support:donations",
    "Donations page photo",
    "Photo at the bottom of the Donations page.",
    "16/9",
  ),
  image(
    "sponsorship_photo_1",
    "support",
    "support:sponsorship",
    "Sponsorship page — photo 1",
    "First of two small photos at the bottom of the Sponsorship page.",
    "4/3",
  ),
  image(
    "sponsorship_photo_2",
    "support",
    "support:sponsorship",
    "Sponsorship page — photo 2",
    "Second of two small photos at the bottom of the Sponsorship page.",
    "4/3",
  ),

  // Contact ---------------------------------------------------------------------
  {
    key: "contact.heading",
    page: "contact",
    section: "contact:opening",
    label: "Heading",
    type: "text",
    default: "Get in touch",
  },
  {
    key: "contact.intro",
    page: "contact",
    section: "contact:opening",
    label: "Introduction",
    type: "text",
    default:
      "Questions, ideas, or want to get involved? Send us a message and we'll get back to you.",
  },
  image(
    "contact_photo_1",
    "contact",
    "contact:opening",
    "Contact page — photo 1",
    "First of three photos at the bottom of the Contact page.",
    "1/1",
  ),
  image(
    "contact_photo_2",
    "contact",
    "contact:opening",
    "Contact page — photo 2",
    "Second of three photos at the bottom of the Contact page.",
    "1/1",
  ),
  image(
    "contact_photo_3",
    "contact",
    "contact:opening",
    "Contact page — photo 3",
    "Third of three photos at the bottom of the Contact page.",
    "1/1",
  ),

  // Brand ---------------------------------------------------------------------
  //
  // Deliberately few slots. Most of /brand is *derived* -- the palette comes
  // from BRAND_COLOR_TOKENS crossed with the tenant's `brand.*` rows, the
  // gradient from `accent_stops`, the logo from `logo_url`, the specimens from
  // `org.tagline`. Restating any of that here would reintroduce exactly the
  // drift the page exists to end: two places to change a colour, one of which
  // is prose nobody remembers to update.
  //
  // What is left is the part no token can hold -- how an organization talks,
  // how its name is written, and what may be done to its mark.
  {
    key: "brand.heading",
    page: "brand",
    section: "brand:opening",
    label: "Heading",
    type: "text",
    default: "Brand & Design Guide",
  },
  {
    key: "brand.intro",
    page: "brand",
    section: "brand:opening",
    label: "Introduction",
    description:
      "Who this page is for -- typically partners, sponsors, press and anyone producing materials on the organization's behalf.",
    type: "text",
    default:
      "Everything on this page is read from the live site, so it is never out of date. Use it when you are producing anything that carries our name.",
  },
  {
    key: "brand.voice",
    page: "brand",
    section: "brand:usage",
    label: "Voice and tone",
    description:
      "How the organization sounds in writing, as do/don't pairs. Not derivable from anything -- a palette says nothing about how you talk.",
    type: "list",
    fields: [
      { key: "do", label: "Do", kind: "text" },
      { key: "dont", label: "Don't", kind: "text" },
    ],
    default: [
      {
        do: "Say what your organization sounds like at its best.",
        dont: "And the habit it should avoid.",
      },
    ],
  },
  {
    key: "brand.logo_rules",
    page: "brand",
    section: "brand:usage",
    label: "Logo usage",
    description:
      "Clear space, minimum size, and what must not be done to the mark. The rules that belong to the design system are already stated on the page; these are yours.",
    type: "list",
    fields: BULLET,
    default: [{ text: "A rule about how your logo may and may not be used." }],
  },
  {
    key: "brand.name_usage",
    page: "brand",
    section: "brand:usage",
    label: "Name in prose",
    description:
      "How to write the organization's name -- the legal name against the short one, capitalisation, and anything that is commonly got wrong.",
    type: "paragraphs",
    default: [
      "How your organization's name should be written in running text, and which form belongs in a first mention.",
    ],
  },

  // Links -----------------------------------------------------------------------
  //
  // The link-in-bio page (#937). Instagram allows one link in a profile, so
  // this is the page it points at and the list below is what the organization
  // is currently asking people to do. It is edited far more often than the
  // rest of the site -- a gear drive this month, a fundraiser the next -- which
  // is the whole reason it is content rather than a route per campaign.
  {
    key: "links.heading",
    page: "links",
    section: "links:page",
    label: "Heading",
    type: "text",
    default: "Find us here",
  },
  {
    key: "links.intro",
    page: "links",
    section: "links:page",
    label: "Introduction",
    description:
      "One line under the heading, for people arriving from a social profile. Leave blank for none.",
    type: "text",
    default: "",
  },
  {
    key: "links.items",
    page: "links",
    section: "links:page",
    label: "Links",
    description:
      "In the order they appear on the page. A link that is switched off keeps its place here and is not published, so a seasonal one can be turned back on rather than retyped.",
    type: "list",
    fields: [
      { key: "label", label: "Button text", kind: "text" },
      { key: "url", label: "Destination", kind: "url" },
      {
        key: "description",
        label: "Supporting line",
        kind: "text",
        optional: true,
      },
      { key: "published", label: "Published", kind: "boolean" },
    ],
    default: [
      {
        label: "Upcoming events",
        url: "/events",
        description: "Where to find us next.",
        published: true,
      },
    ],
  },

  // Legal -----------------------------------------------------------------------
  {
    key: "legal.privacy",
    page: "legal",
    section: "legal:documents",
    label: "Privacy policy",
    description:
      "Replaces the whole privacy page. Leave unset to serve the platform's starting document -- a neutral draft for your own legal counsel to review and rewrite, not legal advice.",
    type: "document",
    default: null,
    route: "/privacy",
  },
  {
    key: "legal.terms",
    page: "legal",
    section: "legal:documents",
    label: "Terms of use",
    description:
      "Replaces the whole terms page. Leave unset to serve the platform's starting document -- a neutral draft for your own legal counsel to review and rewrite, not legal advice.",
    type: "document",
    default: null,
    route: "/terms",
  },
  {
    key: "legal.code_of_conduct",
    page: "legal",
    section: "legal:documents",
    label: "Code of conduct",
    description:
      "Replaces the whole code of conduct page. Leave unset to serve the platform's starting document -- a neutral draft for your own legal counsel to review and rewrite, not legal advice.",
    type: "document",
    default: null,
    route: "/code-of-conduct",
  },
] as const;

const SLOTS_BY_KEY = new Map(
  SITE_CONTENT_SLOTS.map((slot) => [slot.key, slot]),
);

export function contentSlot(key: string): ContentSlot | undefined {
  return SLOTS_BY_KEY.get(key);
}

export function slotsForPage(page: string): ContentSlot[] {
  return SITE_CONTENT_SLOTS.filter((slot) => slot.page === page);
}

export function sectionsForPage(page: string): ContentSection[] {
  return CONTENT_SECTIONS.filter((section) => section.page === page);
}

export function slotsForSection(section: string): ContentSlot[] {
  return SITE_CONTENT_SLOTS.filter((slot) => slot.section === section);
}

/** An image slot's editor label, by the short name a page reads it under. */
export function imageSlotLabel(name: string): string | undefined {
  return contentSlot(`${IMAGE_SLOT_KEY_PREFIX}${name}`)?.label;
}

/**
 * The image slots a `photo` field offers, in registry order.
 *
 * The editor builds a select from this, so a slot that does not exist cannot
 * be named (#922). The fallback slot is deliberately not one of the choices:
 * it is already what choosing nothing means.
 */
export function photoSlotChoices(
  field: PhotoListField,
): { name: string; label: string }[] {
  return SITE_CONTENT_SLOTS.filter(
    (slot) =>
      slot.type === "image" &&
      imageSlotName(slot.key).startsWith(field.slotPrefix),
  ).map((slot) => ({ name: imageSlotName(slot.key), label: slot.label }));
}

/** Where the picture a row shows came from. */
export type PhotoSource = "url" | "slot" | "fallback" | "none";

export type ResolvedPhoto = {
  /** Renderable, or null when nothing is set anywhere: the placeholder icon. */
  url: string | null;
  from: PhotoSource;
  /** The slot it came from, for `slot` and `fallback`. */
  slot?: string;
};

/**
 * The picture a `photo` field resolves to: the row's own link, else the image
 * slot it names, else the shared fallback slot.
 *
 * The public page and the editor's preview both call this, so the precedence
 * cannot drift between the two -- which is the whole reason the editor can
 * claim to show what the site will show (#922). `images` is keyed by short
 * slot name, the shape `getSiteImageUrls()` returns; values may be raw or
 * already resolved, since `resolveImageUrl()` is idempotent.
 */
export function resolvePhoto(
  field: PhotoListField,
  /** The row, in whatever shape its caller reads list items as. */
  item: Readonly<Record<string, unknown>>,
  images: Readonly<Record<string, string | null | undefined>>,
): ResolvedPhoto {
  const text = (key: string): string => {
    const value = item[key];
    return typeof value === "string" ? value.trim() : "";
  };
  const own = text(field.key);
  if (own) return { url: resolveImageUrl(own), from: "url" };
  const slot = text(field.slotField);
  const named = slot ? (images[slot] ?? null) : null;
  if (named) return { url: resolveImageUrl(named), from: "slot", slot };
  const shared = images[field.fallbackSlot] ?? null;
  if (shared) {
    return {
      url: resolveImageUrl(shared),
      from: "fallback",
      slot: field.fallbackSlot,
    };
  }
  return { url: null, from: "none" };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isListItem(value: unknown, fields: readonly ListField[]): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return fields.every((field) => {
    const v = item[field.key];
    // A switch is the one field `optional` says nothing useful about: it
    // cannot be left blank, only left unset, and a row stored before the
    // field existed has no key for it. Rejecting those rows would send the
    // whole slot back to its registry default -- every link an organization
    // had written replaced by the example one -- over a field that has a
    // perfectly good answer without them.
    if (v === undefined)
      return field.kind === "boolean" || Boolean(field.optional);
    switch (field.kind) {
      case "text":
        return typeof v === "string";
      case "paragraphs":
        return isStringArray(v);
      case "boolean":
        return typeof v === "boolean";
      case "url":
        // Publishable, not merely a string -- the same stance `image` takes two
        // cases down. An optional url may be blank; a set one has to be a
        // destination the site will actually put in an `href`.
        if (typeof v !== "string") return false;
        return field.optional && v === "" ? true : isPublishableHref(v);
      case "photo":
        // Renderable when set, the stance an `image` slot takes, so a photo
        // that would 404 is refused on the way in rather than on the page.
        // Blank is the ordinary case: it means "use the slot instead".
        if (typeof v !== "string") return false;
        return v === "" ? true : isRenderableImageSrc(v);
    }
  });
}

function isLegalDocument(value: unknown): value is LegalDocumentContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const doc = value as Record<string, unknown>;
  return (
    typeof doc.title === "string" &&
    typeof doc.last_updated === "string" &&
    isStringArray(doc.summary) &&
    Array.isArray(doc.sections) &&
    doc.sections.every(
      (section) =>
        section &&
        typeof section === "object" &&
        typeof (section as LegalDocumentSection).id === "string" &&
        typeof (section as LegalDocumentSection).title === "string" &&
        isStringArray((section as LegalDocumentSection).paragraphs),
    )
  );
}

/**
 * Whether a stored value has the shape its slot declares. Used on the way
 * in (the editor's action refuses anything else) and on the way out (a row
 * someone edited by hand falls back to the default instead of crashing the
 * page).
 */
export function isValidSlotValue(slot: ContentSlot, value: unknown): boolean {
  switch (slot.type) {
    case "text":
      return typeof value === "string";
    case "paragraphs":
      return isStringArray(value);
    case "list":
      return (
        Array.isArray(value) && value.every((v) => isListItem(v, slot.fields))
      );
    case "document":
      return isLegalDocument(value);
    case "image":
      // Renderable, not merely non-empty. "team-photo.jpg" used to pass here,
      // and `type="url"` on the box only guards the form submit -- "Publish"
      // is a button, so it went straight past to the public site, where it
      // resolved against whatever page was showing it and 404ed (#918).
      return isRenderableImageSrc(typeof value === "string" ? value : null);
  }
}

/**
 * A slot's default with the tenant's own words in it (#896).
 *
 * Only `text`, `paragraphs` and `list` carry copy; `image` and `document`
 * default to null, and a document's text is the separate neutral default in
 * `src/lib/legal-defaults.ts`.
 */
export function lexiconDefault(slot: ContentSlot, lexicon: Lexicon): unknown {
  switch (slot.type) {
    case "text":
      return applyLexicon(slot.default, lexicon);
    case "paragraphs":
      return applyLexiconAll(slot.default, lexicon);
    case "list":
      return slot.default.map((item) =>
        Object.fromEntries(
          Object.entries(item).map(([field, value]) => [
            field,
            // A boolean field has no words in it, so it passes through
            // untouched rather than through a string substitution.
            typeof value === "boolean"
              ? value
              : typeof value === "string"
                ? applyLexicon(value, lexicon)
                : applyLexiconAll(value, lexicon),
          ]),
        ),
      );
    default:
      return slot.default;
  }
}

/** Typed reads over the resolved content, falling back to each slot's default. */
export type SiteContent = {
  text(key: string): string;
  paragraphs(key: string): string[];
  list<T extends ListItem = ListItem>(key: string): T[];
  document(key: string): LegalDocumentContent | null;
  /** The stored URL, unresolved; the public site reads images through `getSiteImageUrls()` instead. */
  image(key: string): string | null;
  /** Which slots are set for this tenant, for the editor. */
  overrides: ReadonlySet<string>;
};

export type SiteContentRow = { key: string; value: unknown };

/**
 * Folds the tenant's rows over the registry defaults. Pure.
 *
 * The lexicon is the tenant's words for what it lends (#896), and it reaches
 * the defaults only -- see the note at the top of this file. It falls back to
 * the platform's own words, so a caller with no tenant to speak for (a test,
 * `DEFAULT_SITE_CONTENT`) still reads a complete site rather than one with
 * braces in it.
 */
export function resolveSiteContent(
  rows: readonly SiteContentRow[],
  lexicon: Lexicon = DEFAULT_LEXICON,
): SiteContent {
  const values = new Map<string, unknown>();
  for (const row of rows) {
    const slot = SLOTS_BY_KEY.get(row.key);
    if (slot && isValidSlotValue(slot, row.value)) {
      values.set(row.key, row.value);
    }
  }

  function read<T>(key: string, type: ContentSlot["type"]): T {
    const slot = SLOTS_BY_KEY.get(key);
    if (!slot || slot.type !== type) {
      throw new Error(`Unknown ${type} content slot: ${key}`);
    }
    return (
      values.has(key) ? values.get(key) : lexiconDefault(slot, lexicon)
    ) as T;
  }

  return {
    text: (key) => read<string>(key, "text"),
    paragraphs: (key) => read<string[]>(key, "paragraphs"),
    list: <T extends ListItem>(key: string) => read<T[]>(key, "list"),
    document: (key) => read<LegalDocumentContent | null>(key, "document"),
    image: (key) => read<string | null>(key, "image"),
    overrides: new Set(values.keys()),
  };
}

/** The content with nothing set: the site as shipped. */
export const DEFAULT_SITE_CONTENT: SiteContent = resolveSiteContent([]);
