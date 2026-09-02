export type LearnCategory = {
  slug: string;
  title: string;
  description: string;
};

export const LEARN_CATEGORIES: LearnCategory[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    description:
      "New to snow sports? Start here for the basics of your first day on the mountain.",
  },
  {
    slug: "gear-and-sizing",
    title: "Gear & Sizing",
    description:
      "What gear you need and how it should fit, from skis and boards to boots and bindings.",
  },
  {
    slug: "mountain-basics",
    title: "Mountain Basics",
    description:
      "Reading trail signs, understanding lifts, and finding your way around a resort.",
  },
  {
    slug: "budget",
    title: "Snow Sports on a Budget",
    description:
      "Ways to get on the mountain without spending more than you have to.",
  },
  {
    slug: "etiquette",
    title: "Mountain & Lift Etiquette",
    description:
      "Unwritten rules for sharing lifts, lines, and trails with everyone else out there.",
  },
  {
    slug: "park-riding-safety",
    title: "Park Riding & Safety",
    description:
      "Terrain park etiquette, feature progression, and staying safe out there — with links to the official rules and resources.",
  },
  {
    slug: "gear-care",
    title: "Gear Care",
    description:
      "Keeping your equipment in good shape between trips, and knowing when it needs a shop.",
  },
  {
    slug: "community-and-inclusion",
    title: "Community & Inclusion",
    description:
      "Finding your place in the snow sports community, whatever that looks like for you.",
  },
];

export function getLearnCategory(slug: string): LearnCategory | undefined {
  return LEARN_CATEGORIES.find((category) => category.slug === slug);
}

export type LearnListItem = {
  label: string;
  text: string;
};

export type LearnLink = {
  label: string;
  href: string;
  internal?: boolean;
};

export type LearnArticle = {
  id: string;
  title: string;
  description: string;
  paragraphs: string[];
  list: LearnListItem[];
  links: LearnLink[];
  disclaimer: string;
};
