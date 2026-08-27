export type LearnListItem = {
  label: string;
  text: string;
};

export type LearnLink = {
  label: string;
  href: string;
  internal?: boolean;
};

export type ParkSafetyArticle = {
  id: string;
  title: string;
  description: string;
  paragraphs: string[];
  list: LearnListItem[];
  links: LearnLink[];
  disclaimer: string;
};

export const PARK_SAFETY_ARTICLES: ParkSafetyArticle[] = [
  {
    id: "etiquette",
    title: "Terrain park etiquette & responsibility code",
    description:
      "Terrain parks carry the same responsibility code as the rest of the mountain, plus a few extra norms specific to features, takeoffs, and landings. This is the general shape of it — always confirm a resort's own park rules with posted signage or ski patrol.",
    list: [
      {
        label: "Start small",
        text: "Get comfortable on smaller, slower features before working up to anything bigger, faster, or more technical.",
      },
      {
        label: "Plan your line",
        text: "Decide your speed and path before you commit to a feature, not while you're already on it.",
      },
      {
        label: "Look before you drop",
        text: "Confirm the feature and landing are clear, and that the rider ahead of you has cleared out, before you go.",
      },
      {
        label: "Respect the feature and others",
        text: "Don't stop or linger in a landing zone, blind spot, or takeoff, and give the next rider room to land and clear.",
      },
      {
        label: "Know your limits",
        text: "It's fine to walk a feature or session something smaller — there's no prize for pushing past what you're ready for.",
      },
    ],
    paragraphs: [
      "Right-of-way in the park generally goes to whoever's already committed to a feature or still in the landing zone — wait your turn rather than dropping in on top of someone.",
      "Call your drop-in when other riders are around so people know to clear the landing, and move out of the way quickly once you're down so the next person has room.",
      "Treat posted closures, ropes, and signage as off-limits even if a feature looks ridable — closures usually mean grooming, feature maintenance, or an incident in progress.",
    ],
    links: [
      {
        label: "NSAA — Your Responsibility Code",
        href: "https://www.nsaa.org/NSAA/Safety/Your_Responsibility_Code.aspx",
      },
      {
        label: "NSAA — Park Smart terrain park safety",
        href: "https://skisafety.us/terrain-park-safety",
      },
    ],
    disclaimer:
      "These are general norms, not a specific mountain's official rules — always check posted signage or ask ski patrol how a particular resort runs its terrain park.",
  },
  {
    id: "progression",
    title: "Park feature progression basics",
    description:
      "Terrain parks group features into a few broad categories, usually graded by size the same way trails are graded by difficulty. This is an overview of what's out there, not instruction on how to ride any of it.",
    list: [
      {
        label: "Rails & boxes",
        text: "Narrow metal or plastic features you slide across. Usually the entry point into park riding, and typically graded small, medium, or large by height and length.",
      },
      {
        label: "Jumps",
        text: "Shaped mounds of snow with a takeoff, a gap, and a landing. Resorts typically group jumps into small, medium, and large lines by how much air time and distance they cover.",
      },
      {
        label: "Halfpipe",
        text: "A U-shaped trench with two opposing walls. Fewer resorts maintain one, and it's generally considered advanced terrain.",
      },
    ],
    paragraphs: [
      "Progression in the park usually means starting on the smallest size in a category and getting genuinely comfortable there, not just surviving it once, before moving up a tier.",
      'A big share of terrain-park injuries come from attempting something a rider isn\'t ready for yet, rather than from the features themselves. Skipping a size tier because a bigger feature "looks doable" is one of the more common ways that happens.',
      "For actual technique and how to build toward a specific feature, a lesson or instructor is the right resource — ski patrol is also there if you're ever unsure whether something is within your current ability.",
    ],
    links: [
      {
        label: "Chatter programs — mentorship & beginner sessions",
        href: "/programs",
        internal: true,
      },
      {
        label: "NSAA — Park Smart terrain park safety",
        href: "https://skisafety.us/terrain-park-safety",
      },
    ],
    disclaimer:
      "This is a general overview of feature types, not instruction — technique and how to progress safely on a specific feature is best learned from an instructor or experienced rider, not an article.",
  },
  {
    id: "safety-gear",
    title: "Park safety gear & injury-prevention awareness",
    description:
      "Terrain parks carry more fall and collision risk than groomed runs, so a few things matter more here than they might elsewhere on the mountain.",
    list: [
      {
        label: "Helmet",
        text: "A properly fitted helmet is close to standard in terrain parks at this point — most resorts strongly encourage or require one in park zones.",
      },
      {
        label: "Wrist guards",
        text: "Common for snowboarders, especially while learning — wrists are one of the most frequently injured areas in falls.",
      },
      {
        label: "Padding",
        text: "Impact shorts, knee pads, or a back protector are worth considering for park riding, where falls tend to be harder and less predictable than on groomed terrain.",
      },
    ],
    paragraphs: [
      "Before dropping into a feature, take a moment to check that the landing and run-out are clear, wait for the rider ahead of you to fully clear the area, and know where you're headed once you're down.",
      "If you or someone nearby is hurt, get ski patrol involved — most resorts have a way to flag them down, and features are usually marked with the nearest contact point or call box. Ski patrol is trained for on-mountain injuries in a way a fellow rider isn't.",
      "This isn't medical guidance: don't try to diagnose or treat an injury yourself beyond basic first aid you're trained in — get the injured person to ski patrol or another qualified professional and let them assess it.",
    ],
    links: [
      {
        label: "NSAA — Park Smart terrain park safety",
        href: "https://skisafety.us/terrain-park-safety",
      },
    ],
    disclaimer:
      "This is general safety awareness, not medical or first-aid instruction — for anything involving an actual injury, ski patrol or a medical professional is the right call, not this article.",
  },
];
