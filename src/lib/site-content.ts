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
 * This module is imported by the editor, a client component, so it stays
 * free of server-only imports; the database read lives in
 * `src/lib/public-site.ts`.
 */

export type ContentPage = {
  key: string;
  label: string;
  /** Where on the public site the page's slots render. */
  route: string;
};

export const CONTENT_PAGES: readonly ContentPage[] = [
  { key: "org", label: "Organization", route: "/home" },
  { key: "home", label: "Home", route: "/home" },
  { key: "about_story", label: "About: Our Story", route: "/about/story" },
  {
    key: "about_mission",
    label: "About: Mission & Values",
    route: "/about/mission",
  },
  { key: "about_team", label: "About: Meet the Team", route: "/about/team" },
  { key: "events", label: "Events", route: "/events" },
  { key: "programs", label: "Programs", route: "/programs" },
  { key: "learn", label: "Learn", route: "/learn" },
  { key: "gears", label: "Gear", route: "/gears/library" },
  { key: "get_involved", label: "Get Involved", route: "/get-involved" },
  { key: "support", label: "Support", route: "/support" },
  { key: "contact", label: "Contact", route: "/contact" },
  { key: "legal", label: "Legal documents", route: "/privacy" },
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

type SlotBase = {
  key: string;
  page: string;
  label: string;
  description?: string;
};

export type ContentSlot = SlotBase &
  (
    | { type: "text"; default: string }
    | { type: "paragraphs"; default: string[] }
    | { type: "list"; fields: readonly ListField[]; default: ListItem[] }
    | { type: "document"; default: null; route: string }
  );

const BULLET: readonly ListField[] = [
  { key: "text", label: "Item", kind: "text" },
];

export const SITE_CONTENT_SLOTS: readonly ContentSlot[] = [
  // Organization --------------------------------------------------------------
  {
    key: "org.short_name",
    page: "org",
    label: "Short name",
    description:
      "How the organization refers to itself mid-sentence. The full name comes from the organization's record.",
    type: "text",
    default: "Chatter",
  },
  {
    key: "org.tagline",
    page: "org",
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
    label: "Photo description",
    description:
      "The text a screen reader announces for the community photos across the site.",
    type: "text",
    default: "Chatter Snow community members",
  },
  {
    key: "org.email_general",
    page: "org",
    label: "General email",
    description: "Where the contact page and the footer point.",
    type: "text",
    default: "info@chattersnow.org",
  },
  {
    key: "org.email_privacy",
    page: "org",
    label: "Privacy email",
    description: "Access, correction and deletion requests.",
    type: "text",
    default: "privacy@chattersnow.org",
  },
  {
    key: "org.email_conduct",
    page: "org",
    label: "Conduct email",
    description: "Code of conduct reports.",
    type: "text",
    default: "conduct@chattersnow.org",
  },
  {
    key: "org.instagram_handle",
    page: "org",
    label: "Instagram handle",
    description: "Without the @. Leave blank to hide the Instagram links.",
    type: "text",
    default: "chattersnow",
  },
  {
    key: "org.footer_contact_eyebrow",
    page: "org",
    label: "Footer contact heading",
    type: "text",
    default: "Get in touch",
  },

  // Home ----------------------------------------------------------------------
  {
    key: "home.heading",
    page: "home",
    label: "Heading",
    type: "text",
    default: "A queer ski & snowboard community",
  },
  {
    key: "home.intro",
    page: "home",
    label: "Introduction",
    type: "text",
    default:
      "Chatter brings LGBTQ+ skiers and snowboarders together on and off the East Coast mountains, and works to make snow sports more accessible through gear, mentorship, and community.",
  },
  {
    key: "home.cta_events",
    page: "home",
    label: "Events button",
    type: "text",
    default: "Join an event",
  },
  {
    key: "home.cta_get_involved",
    page: "home",
    label: "Get involved button",
    type: "text",
    default: "Get involved",
  },
  {
    key: "home.cta_donate",
    page: "home",
    label: "Donate button",
    description: "Shown only while the Support section is visible.",
    type: "text",
    default: "Donate",
  },
  {
    key: "home.next_event_eyebrow",
    page: "home",
    label: "Next event label",
    type: "text",
    default: "Next up",
  },

  // About: Our Story ------------------------------------------------------------
  {
    key: "about_story.heading",
    page: "about_story",
    label: "Heading",
    type: "text",
    default: "About Chatter",
  },
  {
    key: "about_story.intro",
    page: "about_story",
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
    label: "Story heading",
    type: "text",
    default: "Our Story",
  },
  {
    key: "about_story.body",
    page: "about_story",
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

  // About: Mission & Values ------------------------------------------------------
  {
    key: "about_mission.heading",
    page: "about_mission",
    label: "Heading",
    type: "text",
    default: "Our Mission",
  },
  {
    key: "about_mission.statement",
    page: "about_mission",
    label: "Mission statement",
    description: "Shown in quotation marks.",
    type: "text",
    default:
      "Bringing together LGBTQ+ boarders and skiers on and off the mountain. Creating inclusive safe spaces for everyone on the East Coast.",
  },
  {
    key: "about_mission.lead_in",
    page: "about_mission",
    label: "Lead-in to the list",
    type: "text",
    default:
      "We believe snow sports should be something people can participate in regardless of their experience, background, or budget. Chatter works to make that possible by:",
  },
  {
    key: "about_mission.points",
    page: "about_mission",
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
    label: "Closing line",
    type: "text",
    default:
      "We're not just creating a place to ride. We're building a community that makes it easier for queer people to get there in the first place.",
  },
  {
    key: "about_mission.values_heading",
    page: "about_mission",
    label: "Values heading",
    type: "text",
    default: "Our Values",
  },
  {
    key: "about_mission.values",
    page: "about_mission",
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
    label: "Why heading",
    type: "text",
    default: "Why LGBTQ+ snow sports",
  },
  {
    key: "about_mission.why_body",
    page: "about_mission",
    label: "Why",
    type: "paragraphs",
    default: [
      "Ski towns and mountain culture haven't always felt welcoming to queer and trans people, and the cost of entry, gear, lift tickets, lessons, travel can make snow sports feel out of reach before someone even gets to the mountain.",
      "A dedicated LGBTQ+ space changes that. It gives people a lower-pressure way to try skiing or snowboarding for the first time, surrounded by others who understand what it's like to walk into a lodge or a lift line without knowing if they'll be accepted. It also means there's a community to come back to season after season, not just a single event.",
    ],
  },

  // About: Meet the Team ---------------------------------------------------------
  {
    key: "about_team.heading",
    page: "about_team",
    label: "Heading",
    type: "text",
    default: "Meet the team",
  },
  {
    key: "about_team.members",
    page: "about_team",
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
    label: "Missing bio text",
    type: "text",
    default: "Bio coming soon.",
  },

  // Events ----------------------------------------------------------------------
  {
    key: "events.heading",
    page: "events",
    label: "Events heading",
    type: "text",
    default: "Upcoming & past events",
  },
  {
    key: "events.intro",
    page: "events",
    label: "Events introduction",
    type: "text",
    default: "Browse Chatter Snow events happening on and off the mountain.",
  },
  {
    key: "events.community_heading",
    page: "events",
    label: "Community calendar heading",
    type: "text",
    default: "Community Calendar",
  },
  {
    key: "events.community_intro",
    page: "events",
    label: "Community calendar introduction",
    type: "text",
    default:
      "Chatter-hosted events are marked as such. Other entries are community observances, seasonal moments, and campaigns Chatter is highlighting — not events Chatter hosts or organizes.",
  },

  // Programs --------------------------------------------------------------------
  {
    key: "programs.heading",
    page: "programs",
    label: "Heading",
    type: "text",
    default: "Programs",
  },
  {
    key: "programs.intro",
    page: "programs",
    label: "Introduction",
    type: "text",
    default: "Get access. Find your people. Learn and progress. Keep riding.",
  },
  {
    key: "programs.pillars",
    page: "programs",
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
    label: "Heading",
    type: "text",
    default: "Learn",
  },
  {
    key: "learn.intro",
    page: "learn",
    label: "Introduction",
    description: "A link to the sizing guide follows it.",
    type: "text",
    default:
      "Snow sports 101 — orientation basics for anyone new to skiing or riding. Looking for equipment size charts specifically? Check the",
  },

  // Gear ------------------------------------------------------------------------
  {
    key: "gears.library_heading",
    page: "gears",
    label: "Library heading",
    type: "text",
    default: "Gear library",
  },
  {
    key: "gears.library_intro",
    page: "gears",
    label: "Library introduction",
    type: "text",
    default: "Browse gear currently available to the community.",
  },
  {
    key: "gears.donate_heading",
    page: "gears",
    label: "How it works heading",
    type: "text",
    default: "How the gear program works",
  },
  {
    key: "gears.donate_intro",
    page: "gears",
    label: "How it works",
    type: "text",
    default:
      "Chatter collects donated ski and snowboard gear and makes it available to people in the community who need it. Browse the library, add what you need to your cart, and submit one request for everything at once. We'll help coordinate pickup or drop-off at an upcoming event.",
  },
  {
    key: "gears.request_heading",
    page: "gears",
    label: "Request heading",
    type: "text",
    default: "Don't see what you need?",
  },
  {
    key: "gears.request_body",
    page: "gears",
    label: "Request",
    type: "text",
    default:
      "If your size or item isn't currently in the library, send us a message and we'll do our best to match you with available gear.",
  },
  {
    key: "gears.accept_heading",
    page: "gears",
    label: "Donate heading",
    type: "text",
    default: "Donate gear",
  },
  {
    key: "gears.accept_title",
    page: "gears",
    label: "What we accept",
    type: "text",
    default: "We accept gently used gear",
  },
  {
    key: "gears.accept_items",
    page: "gears",
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
    label: "How to drop off",
    type: "text",
    default:
      "Drop items off in person at any Chatter event, or contact us to arrange a drop-off, mail-in, or collection.",
  },
  {
    key: "gears.drives_heading",
    page: "gears",
    label: "Gear drives heading",
    type: "text",
    default: "Gear drives",
  },
  {
    key: "gears.drives_body",
    page: "gears",
    label: "Gear drives",
    description: "A link to Events follows it.",
    type: "text",
    default:
      "We periodically run gear drives and swap events where the community can donate, trade, and pick up gear in person. See",
  },

  // Get involved ----------------------------------------------------------------
  {
    key: "get_involved.heading",
    page: "get_involved",
    label: "Heading",
    type: "text",
    default: "Get involved",
  },
  {
    key: "get_involved.intro",
    page: "get_involved",
    label: "Introduction",
    type: "text",
    default:
      "Chatter runs on people showing up in whatever way works for them — on the mountain, behind the scenes, or by helping us grow.",
  },
  {
    key: "get_involved.sponsor_heading",
    page: "get_involved",
    label: "Sponsor heading",
    type: "text",
    default: "Sponsor Chatter",
  },
  {
    key: "get_involved.sponsor_body",
    page: "get_involved",
    label: "Sponsor",
    type: "text",
    default: "Sponsorships help fund events, gear, and programs.",
  },
  {
    key: "get_involved.gear_heading",
    page: "get_involved",
    label: "Donate gear heading",
    type: "text",
    default: "Donate gear",
  },
  {
    key: "get_involved.gear_body",
    page: "get_involved",
    label: "Donate gear",
    description: "A link to the Gear page follows it.",
    type: "text",
    default:
      "Have gear you're not using? Donating it helps another rider get on the mountain. See what we accept on our",
  },
  {
    key: "get_involved.attend_heading",
    page: "get_involved",
    label: "Attend heading",
    type: "text",
    default: "Attend",
  },
  {
    key: "get_involved.attend_body",
    page: "get_involved",
    label: "Attend",
    type: "text",
    default:
      "The easiest way to get involved is to show up. Browse upcoming mountain days and community meetups and come ride with us.",
  },
  {
    key: "get_involved.community_heading",
    page: "get_involved",
    label: "Community heading",
    type: "text",
    default: "Join the community",
  },
  {
    key: "get_involved.community_body",
    page: "get_involved",
    label: "Community",
    description: "The Instagram handle follows it.",
    type: "text",
    default:
      "Follow along, meet other members, and hear about events first on Instagram",
  },
  {
    key: "get_involved.partner_heading",
    page: "get_involved",
    label: "Partner heading",
    type: "text",
    default: "Become a partner",
  },
  {
    key: "get_involved.partner_body",
    page: "get_involved",
    label: "Partner",
    type: "text",
    default:
      "We work with mountains, gear brands, and other organizations to make events more affordable and accessible for our community. Partnership can look like a lift ticket discount with a resort, a gear brand supplying demo equipment for an event, a co-hosted meetup with another LGBTQ+ or outdoor organization, or a venue donating space for a gear drive. If your organization wants to collaborate with Chatter in any of these ways, we'd love to hear from you.",
  },
  {
    key: "get_involved.volunteer_heading",
    page: "get_involved",
    label: "Volunteer heading",
    type: "text",
    default: "Volunteer",
  },
  {
    key: "get_involved.volunteer_intro",
    page: "get_involved",
    label: "Volunteer introduction",
    type: "text",
    default:
      "Chatter runs on volunteers. Here are some of the ways you can get involved.",
  },
  {
    key: "get_involved.volunteer_empty",
    page: "get_involved",
    label: "No open roles text",
    type: "text",
    default: "Check back soon for open volunteer roles.",
  },

  // Support ---------------------------------------------------------------------
  {
    key: "support.heading",
    page: "support",
    label: "Heading",
    type: "text",
    default: "Support Chatter",
  },
  {
    key: "support.intro",
    page: "support",
    label: "Introduction",
    type: "text",
    default:
      "Chatter relies on donations, sponsorships, and gear to keep our programs running and accessible.",
  },
  {
    key: "support.donations_card",
    page: "support",
    label: "Donations card",
    type: "text",
    default:
      "Support Chatter with a monetary or in-kind donation. Learn what we accept and how your contribution helps make snow sports more accessible.",
  },
  {
    key: "support.sponsorship_card",
    page: "support",
    label: "Sponsorship card",
    type: "text",
    default:
      "Partner with Chatter through cash, in-kind, or combined support for events, mountain days, and access programs.",
  },
  {
    key: "support.donations_heading",
    page: "support",
    label: "Donations heading",
    type: "text",
    default: "Donations",
  },
  {
    key: "support.donations_intro",
    page: "support",
    label: "Donations introduction",
    type: "text",
    default:
      "Donations help Chatter keep programs running and make skiing and snowboarding more accessible to LGBTQ+ riders.",
  },
  {
    key: "support.monetary_title",
    page: "support",
    label: "Monetary donations title",
    type: "text",
    default: "Monetary donations",
  },
  {
    key: "support.monetary_body",
    page: "support",
    label: "Monetary donations",
    type: "text",
    default:
      "Online monetary donations are coming soon. Contributions will help fund accessible events, mountain days, and community programs.",
  },
  {
    key: "support.inkind_title",
    page: "support",
    label: "In-kind donations title",
    type: "text",
    default: "In-kind donations",
  },
  {
    key: "support.inkind_body",
    page: "support",
    label: "In-kind donations",
    description: "A link to the Gear page follows it.",
    type: "text",
    default:
      "We accept gently used ski and snowboard gear, which we redistribute through our gear program. See what we accept and how to donate on our",
  },
  {
    key: "support.sponsorship_heading",
    page: "support",
    label: "Sponsorship heading",
    type: "text",
    default: "Sponsorship",
  },
  {
    key: "support.sponsorship_intro",
    page: "support",
    label: "Sponsorship introduction",
    type: "text",
    default:
      "Sponsors help fund the core of what Chatter does: subsidizing mountain days, keeping gear access programs running, and making events more affordable for LGBTQ+ riders who might not otherwise be able to join. In return, sponsors get real visibility with our community — event branding, recognition in event materials and on our website, and a direct line to a rider base that shows up for the brands that show up for them.",
  },
  {
    key: "support.sponsorship_tiers",
    page: "support",
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
    label: "Sponsorship button",
    type: "text",
    default: "Talk to us about sponsoring",
  },

  // Contact ---------------------------------------------------------------------
  {
    key: "contact.heading",
    page: "contact",
    label: "Heading",
    type: "text",
    default: "Get in touch",
  },
  {
    key: "contact.intro",
    page: "contact",
    label: "Introduction",
    type: "text",
    default:
      "Questions, ideas, or want to get involved? Send us a message and we'll get back to you.",
  },

  // Legal -----------------------------------------------------------------------
  {
    key: "legal.privacy",
    page: "legal",
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
  }
}

/** Typed reads over the resolved content, falling back to each slot's default. */
export type SiteContent = {
  text(key: string): string;
  paragraphs(key: string): string[];
  list<T extends ListItem = ListItem>(key: string): T[];
  document(key: string): LegalDocumentContent | null;
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
    overrides: new Set(values.keys()),
  };
}

/** The content with nothing set: the site as shipped. */
export const DEFAULT_SITE_CONTENT: SiteContent = resolveSiteContent([]);
