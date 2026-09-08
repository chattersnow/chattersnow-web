/**
 * The content model for the public site (#707 Phase 4).
 *
 * Every piece of organization-specific copy on the public site is a *slot*:
 * a key, a page it belongs to, a type, and a default. The defaults are
 * Chatter Snow's copy, exactly as the pages carried it before this existed,
 * so a tenant with no `site_content` rows renders the site that shipped --
 * and a provisioned tenant starts from a complete site it rewrites slot by
 * slot from Administration > Site Content rather than from a blank page.
 *
 * What is deliberately *not* a slot: the Learn guides and the sizing tables
 * (generic snow-sports material any organization can publish as-is), the
 * form labels and validation messages (product chrome), and the structure of
 * the pages themselves. The legal documents are a special case -- see
 * `document` below.
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
    route: "/gears/library",
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
    label: "Next event",
    description:
      "The label above the next upcoming event -- or, when nothing is on the events calendar, the next community calendar item -- on the homepage.",
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
    route: "/gears/donate",
  },
  {
    key: "gears:request",
    page: "gears",
    label: "Requesting gear",
    route: "/gears/donate",
  },
  {
    key: "gears:accept",
    page: "gears",
    label: "What we accept",
    route: "/gears/donate",
  },
  {
    key: "gears:drives",
    page: "gears",
    label: "Gear drives",
    route: "/gears/donate",
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

  { key: "legal:documents", page: "legal", label: "Documents" },
] as const;

export type ListField = {
  key: string;
  label: string;
  kind: "text" | "paragraphs";
  /** Left blank in the editor when unset; a text field is otherwise required. */
  optional?: boolean;
};

export type ListItem = Record<string, string | string[]>;

/** One section of a structured legal document. */
export type LegalDocumentSection = {
  id: string;
  title: string;
  paragraphs: string[];
};

/**
 * A whole legal page as data: the shape `LegalPageShell` renders. Chatter
 * Snow's own documents stay as components -- they carry links, lists and
 * callouts a flat document cannot -- and a tenant that sets one of these
 * replaces the page outright. Legal text is not something another
 * organization templates; it is something they publish themselves.
 */
export type LegalDocumentContent = {
  title: string;
  last_updated: string;
  summary: string[];
  sections: LegalDocumentSection[];
};

/**
 * The shape of the platform's own document: its title and the headings it is
 * organized under, with none of the text.
 *
 * Nobody drafts a privacy policy from a blank box, so the editor offers this
 * as the starting point (#792). It is deliberately the outline and not the
 * prose: the platform documents carry links, tables and callouts that
 * `LegalDocumentContent` cannot hold, and a tenant publishing Chatter Snow's
 * policy verbatim as their own would be worse than a blank page. Authoring is
 * #601.
 *
 * Each document renders these same entries as its section nav, importing them
 * from here, so the outline offered in the editor and the document on the site
 * cannot drift.
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
      { id: "snow-sports-risks", title: "Snow-sports risks" },
      { id: "gear-library", title: "Gear library" },
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
      { id: "governing-law", title: "Governing law" },
      { id: "severability", title: "Severability" },
      { id: "contact", title: "Contact" },
    ],
  },
  "legal.code_of_conduct": {
    title: "Code of Conduct",
    sections: [
      { id: "what-we-expect", title: "What we expect" },
      { id: "bringing-a-minor", title: "If you’re bringing a minor" },
      { id: "on-the-mountain", title: "On the mountain" },
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
    /** A Google Drive share link or image URL; null is the placeholder icon. */
    | { type: "image"; default: null }
  );

const BULLET: readonly ListField[] = [
  { key: "text", label: "Item", kind: "text" },
];

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
): ContentSlot {
  return {
    key: `${IMAGE_SLOT_KEY_PREFIX}${name}`,
    page,
    section,
    label,
    description,
    type: "image",
    default: null,
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
    default: "Chatter",
  },
  {
    key: "org.tagline",
    page: "org",
    section: "org:identity",
    label: "Site description",
    description:
      "The one-sentence description search engines and link previews show.",
    type: "text",
    default:
      "Chatter Snow is a queer ski and snowboard community bringing LGBTQ+ skiers and snowboarders together on and off the East Coast mountains.",
  },
  {
    key: "org.image_alt",
    page: "org",
    section: "org:identity",
    label: "Photo description",
    description:
      "The text a screen reader announces for the community photos across the site.",
    type: "text",
    default: "Chatter Snow community members",
  },
  {
    key: "org.email_general",
    page: "org",
    section: "org:contact",
    label: "General email",
    description: "Where the contact page and the footer point.",
    type: "text",
    default: "info@chattersnow.org",
  },
  {
    key: "org.email_privacy",
    page: "org",
    section: "org:contact",
    label: "Privacy email",
    description: "Access, correction and deletion requests.",
    type: "text",
    default: "privacy@chattersnow.org",
  },
  {
    key: "org.email_conduct",
    page: "org",
    section: "org:contact",
    label: "Conduct email",
    description: "Code of conduct reports.",
    type: "text",
    default: "conduct@chattersnow.org",
  },
  {
    key: "org.instagram_handle",
    page: "org",
    section: "org:contact",
    label: "Instagram handle",
    description: "Without the @. Leave blank to hide the Instagram links.",
    type: "text",
    default: "chattersnow",
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
    default: "A queer ski & snowboard community",
  },
  {
    key: "home.intro",
    page: "home",
    section: "home:hero",
    label: "Introduction",
    type: "text",
    default:
      "Chatter brings LGBTQ+ skiers and snowboarders together on and off the East Coast mountains, and works to make snow sports more accessible through gear, mentorship, and community.",
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
    key: "home.next_event_eyebrow",
    page: "home",
    section: "home:next_event",
    label: "Next event label",
    type: "text",
    default: "Next up",
  },
  image(
    "home_carousel_1",
    "home",
    "home:hero",
    "Homepage carousel — slide 1",
    "First slide of the homepage image carousel.",
  ),
  image(
    "home_carousel_2",
    "home",
    "home:hero",
    "Homepage carousel — slide 2",
    "Second slide of the homepage image carousel.",
  ),
  image(
    "home_carousel_3",
    "home",
    "home:hero",
    "Homepage carousel — slide 3",
    "Third slide of the homepage image carousel.",
  ),

  // About: Our Story ------------------------------------------------------------
  {
    key: "about_story.heading",
    page: "about_story",
    section: "about_story:opening",
    label: "Heading",
    type: "text",
    default: "About Chatter",
  },
  {
    key: "about_story.intro",
    page: "about_story",
    section: "about_story:opening",
    label: "Introduction",
    type: "paragraphs",
    default: [
      "Chatter is a queer ski and snowboard community on the East Coast that brings LGBTQ+ riders together both on and off the mountain. What started as a small group of friends has grown into a community hosting indoor and mountain meetups, collaborating with other organizations, and creating opportunities for queer skiers and snowboarders to get involved regardless of experience or budget.",
      "At its core, Chatter is about making snow sports more accessible and building community around them. That means more than just organizing group rides. Chatter provides gear through donations and drives, facilitates gear swaps, connects newer riders with on-snow mentorship, and works with mountains and partners to make events more affordable.",
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
      "Chatter started three summers ago when a group of friends wanted to create a space where queer skiers and snowboarders could find each other, ride together, and feel like they belonged on the mountain.",
      "Since then, that idea has grown into an East Coast community. We've brought people together through indoor snow sessions, mountain meetups, park days, collaborations, and events with partner organizations. Our community is largely centered around the NYC area, but we're continuing to grow our reach across the East Coast.",
      "As we've grown, we've realized that simply creating opportunities to ride together isn't enough. Snow sports can be expensive and intimidating to get into, especially for someone who doesn't already have the equipment, knowledge, or community around them.",
      "That's where Chatter's bigger purpose comes in.",
      "We're working to make skiing and snowboarding more accessible to LGBTQ+ people by helping remove some of the financial and social barriers that keep people off the mountain. Through gear donations and swaps, beginner mentorship, affordable group events, and partnerships with mountains and other organizations, we're building a community where people can get into snow sports, improve their skills, and find people to ride with.",
    ],
  },
  image(
    "about_story_photo",
    "about_story",
    "about_story:story",
    "Our Story photo",
    "Photo alongside the Our Story section on the About page.",
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
    default:
      "Bringing together LGBTQ+ boarders and skiers on and off the mountain. Creating inclusive safe spaces for everyone on the East Coast.",
  },
  {
    key: "about_mission.lead_in",
    page: "about_mission",
    section: "about_mission:mission",
    label: "Lead-in to the list",
    type: "text",
    default:
      "We believe snow sports should be something people can participate in regardless of their experience, background, or budget. Chatter works to make that possible by:",
  },
  {
    key: "about_mission.points",
    page: "about_mission",
    section: "about_mission:mission",
    label: "How we do it",
    type: "list",
    fields: BULLET,
    default: [
      { text: "Building community through inclusive ski and snowboard events" },
      { text: "Improving access through gear donations, drives, and swaps" },
      { text: "Supporting new riders through mentorship and on-snow guidance" },
      {
        text: "Making riding more affordable through mountain and community partnerships",
      },
      { text: "Creating connection both on the mountain and beyond it" },
    ],
  },
  {
    key: "about_mission.closing",
    page: "about_mission",
    section: "about_mission:mission",
    label: "Closing line",
    type: "text",
    default:
      "We're not just creating a place to ride. We're building a community that makes it easier for queer people to get there in the first place.",
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
        name: "Inclusion",
        description:
          "Every rider is welcome regardless of experience, background, or budget.",
      },
      {
        name: "Access",
        description:
          "We work to remove the financial and social barriers that keep people off the mountain.",
      },
      {
        name: "Community",
        description:
          "We're building relationships that last beyond a single event or season.",
      },
      {
        name: "Mentorship",
        description:
          "Experienced riders show up for newer ones so no one has to figure it out alone.",
      },
    ],
  },
  {
    key: "about_mission.why_heading",
    page: "about_mission",
    section: "about_mission:why",
    label: "Why heading",
    type: "text",
    default: "Why LGBTQ+ snow sports",
  },
  {
    key: "about_mission.why_body",
    page: "about_mission",
    section: "about_mission:why",
    label: "Why",
    type: "paragraphs",
    default: [
      "Ski towns and mountain culture haven't always felt welcoming to queer and trans people, and the cost of entry, gear, lift tickets, lessons, travel can make snow sports feel out of reach before someone even gets to the mountain.",
      "A dedicated LGBTQ+ space changes that. It gives people a lower-pressure way to try skiing or snowboarding for the first time, surrounded by others who understand what it's like to walk into a lodge or a lift line without knowing if they'll be accepted. It also means there's a community to come back to season after season, not just a single event.",
    ],
  },
  image(
    "about_mission_photo",
    "about_mission",
    "about_mission:values",
    "Our Mission photo",
    "Photo alongside the Our Values section on the Mission page.",
  ),
  image(
    "about_mission_bottom_photo",
    "about_mission",
    "about_mission:why",
    "Mission page — bottom photo",
    "Photo shown at the bottom of the Mission page, below the Why LGBTQ+ Snow Sports section.",
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
  {
    key: "about_team.members",
    page: "about_team",
    section: "about_team:team",
    label: "Team members",
    description:
      "A photo URL overrides the image slot. Leave both blank for the shared team placeholder.",
    type: "list",
    fields: [
      { key: "name", label: "Name", kind: "text" },
      { key: "photo_url", label: "Photo URL", kind: "text", optional: true },
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
        name: "Cass Lainez",
        photo_url: "",
        photo_slot: "about_team_photo_cass",
        bio: [],
      },
      {
        name: "Rickie Cruz",
        photo_url: "",
        photo_slot: "about_team_photo_rickie",
        bio: [
          "Hi, I’m Rickie—a skier, software engineer, and one of Chatter’s token skiers, as Sofie likes to say. ⛷️",
          "Chatter and I have grown alongside each other. We both got serious about the sport and the LGBTQ+ ski and snowboard community around the same time. When Chatter held its first event, I had no gear of my own and knew very few queer people in the ski and snowboard community. By the end of that event, I had made connections and friendships that helped me become a better skier—and somehow walked away with a brand-new Burton jacket.",
          "I got involved with Chatter in late 2025, initially helping with social media and eventually supporting event planning. Today, I focus on building the technology and operational infrastructure behind Chatter—from our website and internal systems to an operations portal that helps us stay organized, manage our programs, and scale as the organization grows.",
          "For me, Chatter is about more than just getting on the mountain. It’s about the people you meet, the friendships you make, and finding a community that makes you want to keep showing up—on and off the mountain.",
          "And yes, I’m still one of the token skiers… for now. 🏳️‍🌈⛷️",
        ],
      },
      {
        name: "Sofie Chavez",
        photo_url: "",
        photo_slot: "about_team_photo_sofie",
        bio: [
          "I'm Sofie, but most friends call me Sof. I've been in the snowboarding world for 5 years and riding for 4. Learning to ride as an adult has been hard work that I enjoy every second of. I fell in love quickly when I linked my first turns at Big Snow, my home mountain/mall.",
          "Chatter was born from my frustration with the homophobia I kept seeing on many mountain pride posts, and the homophobic slurs I'd heard on hill. So in 2024 with the help of my friends and Park Affair, we brought the idea to life. The goal was simple: bring together the queer community and ease the barrier of entry.",
          "When I'm not putting on Chatter events you can usually find me volunteering on snow with Hoods to Wood, We're All Mental, and Black Boarders of CT. Or helping coach beginner park with Park Affair and East Coast Lady Boarders.",
          "When I'm off snow, you can find me playing saxophone, surfing, drawing, rock climbing, playing d&d or reading a comic. And that's the beauty of Chatter! I've made friends on snow that I can share my off snow hobbies with too.",
          "I hope if you're reading this and you're not sure what to do or where to start, just show up to an event. I promise you won't walk away without a new friend and maybe a new to you item!",
        ],
      },
    ],
  },
  {
    key: "about_team.bio_placeholder",
    page: "about_team",
    section: "about_team:team",
    label: "Missing bio text",
    type: "text",
    default: "Bio coming soon.",
  },
  image(
    "about_team_hero_photo",
    "about_team",
    "about_team:team",
    "Meet the Team — top photo",
    "Photo between the Meet the Team heading and the team member cards.",
  ),
  image(
    "about_team_photo_cass",
    "about_team",
    "about_team:team",
    "Team photo — Cass Lainez",
    "Cass Lainez's photo on the Meet the Team page. A team member's Image slot field names it as about_team_photo_cass.",
  ),
  image(
    "about_team_photo_rickie",
    "about_team",
    "about_team:team",
    "Team photo — Rickie Cruz",
    "Rickie Cruz's photo on the Meet the Team page. A team member's Image slot field names it as about_team_photo_rickie.",
  ),
  image(
    "about_team_photo_sofie",
    "about_team",
    "about_team:team",
    "Team photo — Sofie Chavez",
    "Sofie Chavez's photo on the Meet the Team page. A team member's Image slot field names it as about_team_photo_sofie.",
  ),
  image(
    "about_team_photo",
    "about_team",
    "about_team:team",
    "Team member photo",
    "Shown for any team member who doesn't have their own photo.",
  ),

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
    default: "Browse Chatter Snow events happening on and off the mountain.",
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
      "Community observances, seasonal moments, campaigns, and Chatter's own events, all in one place. Not everything listed here is hosted or organized by Chatter.",
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
    default: "Get access. Find your people. Learn and progress. Keep riding.",
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
      { label: "Access", description: "Get on the mountain." },
      {
        label: "Progression",
        description: "Find your people, build your skills.",
      },
      { label: "Community", description: "Keep riding, keep connecting." },
    ],
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
        pillar: "Access",
        emoji: "🎿",
        name: "Learn to Ride",
        description:
          "Beginner-friendly sessions to make getting started in skiing and snowboarding less intimidating — orientation to gear, lifts, and mountain basics in a welcoming LGBTQ+ group setting.",
      },
      {
        pillar: "Access",
        emoji: "🧤",
        name: "Gear Access",
        description:
          "We collect and redistribute donated ski and snowboard equipment to help make snow sports more accessible. See what's currently available on our Gear page.",
      },
      {
        pillar: "Progression",
        emoji: "🤝",
        name: "Ride Buddy",
        description:
          "Paired for the day with an experienced rider — not formal instruction, just someone to answer questions and ride alongside.",
      },
      {
        pillar: "Progression",
        emoji: "🏂",
        name: "Progression & Park Riding",
        description:
          "Skill-focused sessions for riders looking to push themselves. From building confidence on the mountain to learning park fundamentals, we create supportive environments to progress alongside other riders.",
      },
      {
        pillar: "Community",
        emoji: "🏔️",
        name: "Mountain Meetups",
        description:
          "Group days at mountains across the East Coast where the focus is community as much as riding. Chatter provides a central gathering point, organized groups, and opportunities to meet other LGBTQ+ skiers and snowboarders.",
      },
      {
        pillar: "Community",
        emoji: "🌈",
        name: "Community Events",
        description:
          "Off-snow gatherings that keep the community connected year-round, including Pride events, social meetups, outdoor activities, gear swaps, and collaborations with LGBTQ+ and outdoor organizations.",
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
  ),

  // Gear ------------------------------------------------------------------------
  {
    key: "gears.library_heading",
    page: "gears",
    section: "gears:library",
    label: "Library heading",
    type: "text",
    default: "Gear library",
  },
  {
    key: "gears.library_intro",
    page: "gears",
    section: "gears:library",
    label: "Library introduction",
    type: "text",
    default: "Browse gear currently available to the community.",
  },
  {
    key: "gears.donate_heading",
    page: "gears",
    section: "gears:donate",
    label: "How it works heading",
    type: "text",
    default: "How the gear program works",
  },
  {
    key: "gears.donate_intro",
    page: "gears",
    section: "gears:donate",
    label: "How it works",
    type: "text",
    default:
      "Chatter collects donated ski and snowboard gear and makes it available to people in the community who need it. Browse the library, add what you need to your cart, and submit one request for everything at once. We'll help coordinate pickup or drop-off at an upcoming event.",
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
      "If your size or item isn't currently in the library, send us a message and we'll do our best to match you with available gear.",
  },
  {
    key: "gears.accept_heading",
    page: "gears",
    section: "gears:accept",
    label: "Donate heading",
    type: "text",
    default: "Donate gear",
  },
  {
    key: "gears.accept_title",
    page: "gears",
    section: "gears:accept",
    label: "What we accept",
    type: "text",
    default: "We accept gently used gear",
  },
  {
    key: "gears.accept_items",
    page: "gears",
    section: "gears:accept",
    label: "Accepted items",
    type: "list",
    fields: BULLET,
    default: [
      { text: "Skis & snowboards" },
      { text: "Boots & bindings" },
      { text: "Outerwear (jackets, pants)" },
      { text: "Gloves & accessories" },
    ],
  },
  {
    key: "gears.dropoff_body",
    page: "gears",
    section: "gears:accept",
    label: "How to drop off",
    type: "text",
    default:
      "Drop items off in person at any Chatter event, or contact us to arrange a drop-off, mail-in, or collection.",
  },
  {
    key: "gears.drives_heading",
    page: "gears",
    section: "gears:drives",
    label: "Gear drives heading",
    type: "text",
    default: "Gear drives",
  },
  {
    key: "gears.drives_body",
    page: "gears",
    section: "gears:drives",
    label: "Gear drives",
    description: "A link to Events follows it.",
    type: "text",
    default:
      "We periodically run gear drives and swap events where the community can donate, trade, and pick up gear in person. See",
  },
  image(
    "gear_placeholder",
    "gears",
    "gears:library",
    "Gear placeholder",
    "Shown in the gear library for any gear item that doesn't have its own photo.",
  ),
  image(
    "gears_donate_photo",
    "gears",
    "gears:donate",
    "Donate gear page photo",
    "Photo on the Donate Gear page.",
  ),
  image(
    "gears_donate_bottom_photo",
    "gears",
    "gears:drives",
    "Donate gear page — bottom photo",
    "Photo at the bottom of the Donate Gear page, below Gear drives.",
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
    default:
      "Chatter runs on people showing up in whatever way works for them — on the mountain, behind the scenes, or by helping us grow.",
  },
  {
    key: "get_involved.sponsor_heading",
    page: "get_involved",
    section: "get_involved:sponsor",
    label: "Sponsor heading",
    type: "text",
    default: "Sponsor Chatter",
  },
  {
    key: "get_involved.sponsor_body",
    page: "get_involved",
    section: "get_involved:sponsor",
    label: "Sponsor",
    type: "text",
    default: "Sponsorships help fund events, gear, and programs.",
  },
  {
    key: "get_involved.gear_heading",
    page: "get_involved",
    section: "get_involved:gear",
    label: "Donate gear heading",
    type: "text",
    default: "Donate gear",
  },
  {
    key: "get_involved.gear_body",
    page: "get_involved",
    section: "get_involved:gear",
    label: "Donate gear",
    description: "A link to the Gear page follows it.",
    type: "text",
    default:
      "Have gear you're not using? Donating it helps another rider get on the mountain. See what we accept on our",
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
      "We work with mountains, gear brands, and other organizations to make events more affordable and accessible for our community. Partnership can look like a lift ticket discount with a resort, a gear brand supplying demo equipment for an event, a co-hosted meetup with another LGBTQ+ or outdoor organization, or a venue donating space for a gear drive. If your organization wants to collaborate with Chatter in any of these ways, we'd love to hear from you.",
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
      "Chatter runs on volunteers. Here are some of the ways you can get involved.",
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
  ),
  image(
    "get_involved_hero_2",
    "get_involved",
    "get_involved:opening",
    "Get Involved — hero image 2",
    "Small hero image at the top of the Get Involved page.",
  ),
  image(
    "get_involved_hero_3",
    "get_involved",
    "get_involved:opening",
    "Get Involved — hero image 3",
    "Small hero image at the top of the Get Involved page.",
  ),
  image(
    "get_involved_attend_photo",
    "get_involved",
    "get_involved:attend",
    "Attend page photo",
    "Photo on the Attend page.",
  ),
  image(
    "get_involved_community_photo",
    "get_involved",
    "get_involved:community",
    "Attend page — community photo",
    "Photo alongside the Join the Community section on the Attend page.",
  ),
  image(
    "get_involved_partner_photo",
    "get_involved",
    "get_involved:partner",
    "Partner page photo",
    "Photo on the Become a Partner page.",
  ),
  image(
    "get_involved_volunteer_photo",
    "get_involved",
    "get_involved:volunteer",
    "Volunteer page photo",
    "Photo on the Volunteer page.",
  ),

  // Support ---------------------------------------------------------------------
  {
    key: "support.heading",
    page: "support",
    section: "support:opening",
    label: "Heading",
    type: "text",
    default: "Support Chatter",
  },
  {
    key: "support.intro",
    page: "support",
    section: "support:opening",
    label: "Introduction",
    type: "text",
    default:
      "Chatter relies on donations, sponsorships, and gear to keep our programs running and accessible.",
  },
  {
    key: "support.donations_card",
    page: "support",
    section: "support:opening",
    label: "Donations card",
    type: "text",
    default:
      "Support Chatter with a monetary or in-kind donation. Learn what we accept and how your contribution helps make snow sports more accessible.",
  },
  {
    key: "support.sponsorship_card",
    page: "support",
    section: "support:opening",
    label: "Sponsorship card",
    type: "text",
    default:
      "Partner with Chatter through cash, in-kind, or combined support for events, mountain days, and access programs.",
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
    default:
      "Donations help Chatter keep programs running and make skiing and snowboarding more accessible to LGBTQ+ riders.",
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
      "Online monetary donations are coming soon. Contributions will help fund accessible events, mountain days, and community programs.",
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
      "We accept gently used ski and snowboard gear, which we redistribute through our gear program. See what we accept and how to donate on our",
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
      "Sponsors help fund the core of what Chatter does: subsidizing mountain days, keeping gear access programs running, and making events more affordable for LGBTQ+ riders who might not otherwise be able to join. In return, sponsors get real visibility with our community — event branding, recognition in event materials and on our website, and a direct line to a rider base that shows up for the brands that show up for them.",
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
        name: "Cash sponsorship",
        description:
          "Underwrite an event, a season of mountain days, or a program like our gear library. Cash sponsors are the easiest way to keep events affordable and accessible.",
      },
      {
        name: "In-kind sponsorship",
        description:
          "Contribute gear, lift tickets, venue space, or services. In-kind support stretches directly into gear drives, event day logistics, and giveaways.",
      },
      {
        name: "Both",
        description:
          "Many of our sponsors mix cash and in-kind support across a season. We'll work with you to find a combination that fits your organization.",
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
  image(
    "donations_photo",
    "support",
    "support:donations",
    "Donations page photo",
    "Photo at the bottom of the Donations page.",
  ),
  image(
    "sponsorship_photo_1",
    "support",
    "support:sponsorship",
    "Sponsorship page — photo 1",
    "First of two small photos at the bottom of the Sponsorship page.",
  ),
  image(
    "sponsorship_photo_2",
    "support",
    "support:sponsorship",
    "Sponsorship page — photo 2",
    "Second of two small photos at the bottom of the Sponsorship page.",
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
  ),
  image(
    "contact_photo_2",
    "contact",
    "contact:opening",
    "Contact page — photo 2",
    "Second of three photos at the bottom of the Contact page.",
  ),
  image(
    "contact_photo_3",
    "contact",
    "contact:opening",
    "Contact page — photo 3",
    "Third of three photos at the bottom of the Contact page.",
  ),

  // Legal -----------------------------------------------------------------------
  {
    key: "legal.privacy",
    page: "legal",
    section: "legal:documents",
    label: "Privacy policy",
    description:
      "Replaces the whole privacy page. Leave unset to publish the platform's document.",
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
      "Replaces the whole terms page. Leave unset to publish the platform's document.",
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
      "Replaces the whole code of conduct page. Leave unset to publish the platform's document.",
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isListItem(value: unknown, fields: readonly ListField[]): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return fields.every((field) => {
    const v = item[field.key];
    if (v === undefined) return Boolean(field.optional);
    return field.kind === "text" ? typeof v === "string" : isStringArray(v);
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
      return typeof value === "string" && value.trim() !== "";
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

/** Folds the tenant's rows over the registry defaults. Pure. */
export function resolveSiteContent(
  rows: readonly SiteContentRow[],
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
    return (values.has(key) ? values.get(key) : slot.default) as T;
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
