/**
 * The platform's official-rules template: the sections a promotion's rules are
 * made of, and the questions an organization answers once before it can
 * publish any (#1322).
 *
 * Official rules are not one document. Most of what they have to disclose
 * changes from giveaway to giveaway -- entry period, prizes and their
 * approximate retail value, odds, the drawing date -- while the rest is the
 * same every time the same organization runs one: who the sponsor is, who may
 * enter, how somebody enters without donating or buying, what is published
 * about a winner. A single `legal.*` slot cannot carry both, and retyping
 * eligibility and the free-entry address per promotion is how one gets
 * published with last season's dates in it.
 *
 * So the document is assembled from three layers, each owning only what it
 * can:
 *
 *   1. **This template.** Neutral, platform-owned, the same for every tenant:
 *      the ordered sections, what each has to say, and the connective prose a
 *      set of answers is not. Modelled on `src/lib/legal-defaults.ts` (#858)
 *      and bound by the same rules -- it states only what this software does,
 *      makes no commitment on a tenant's behalf, and is described everywhere
 *      it is edited as a starting point for the organization's own counsel
 *      rather than legal advice.
 *   2. **The tenant's answers** (`GIVEAWAY_RULES_ANSWERS`), given once in
 *      Website > Giveaway rules and stored as `giveaway_rules.*` rows in
 *      `app_settings`.
 *   3. **The promotion's own numbers**, derived from what the giveaway already
 *      holds rather than retyped, and overridable per section per giveaway.
 *
 * A published instance is a **copy, not a reference** -- the argument #895
 * made for content packs, and sharper here: a platform edit must never restate
 * the odds a participant already relied on, under an organization's name.
 * Publishing freezes the whole document into a version row; there are no
 * upstream updates after that.
 *
 * Free of server-only imports, like `@/lib/legal-documents` beside it: the
 * giveaway editor and the answers form are client components. The reads live
 * in `@/lib/giveaway-rules-facts.ts`, the prose in
 * `@/lib/giveaway-rules-template.ts`.
 *
 * Nothing in this module is clearance to run a promotion. Whether an
 * organization may run one at all, in which state, and whether a free entry
 * method is required of it, is that organization's question for its own
 * counsel (#666 is Chatter Snow's).
 */

/** Where a section's text comes from, which decides who can supply it. */
export type GiveawayRulesSource =
  /** Answered once by the organization, in Website > Giveaway rules. */
  | "tenant"
  /** Computed from the giveaway's own rows -- dates, prizes, tickets. */
  | "derived"
  /** The platform's neutral prose, the same for every tenant. */
  | "platform";

export type GiveawayRulesSection = {
  /** The anchor on the public page, and the key an override is stored under. */
  id: string;
  title: string;
  source: GiveawayRulesSource;
  /** What this section has to say, for whoever is reviewing or rewriting it. */
  guidance: string;
};

/**
 * The document, in order.
 *
 * The order is the one most published promotion rules use, and it is
 * deliberate: who is running this, who may enter, when, how, how without
 * paying, what the chances are, what is on offer, how it is drawn, what gets
 * said about the winner, and the boilerplate last. A reader looking for the
 * free entry method should not have to pass the liability clauses to reach it.
 */
export const GIVEAWAY_RULES_SECTIONS: readonly GiveawayRulesSection[] = [
  {
    id: "sponsor",
    title: "Who is running this promotion",
    source: "tenant",
    guidance:
      "The legal name of the organization running the promotion, the address it can be written to, and who to ask about these rules. Most states require the sponsor to be identified by name.",
  },
  {
    id: "eligibility",
    title: "Who can enter",
    source: "tenant",
    guidance:
      "Minimum age, where an entrant has to live, and who may not enter — typically staff, board members, and the people they live with.",
  },
  {
    id: "entry-period",
    title: "When entries open and close",
    source: "derived",
    guidance:
      "The entry period, with a timezone, and the date of the drawing. Taken from the event this giveaway belongs to and from the drawing date recorded on it.",
  },
  {
    id: "how-to-enter",
    title: "How to enter",
    source: "derived",
    guidance:
      "Every way an entry is earned and what each one earns. Taken from the giveaway's ticket packages and the tiers a donated item can be classified into.",
  },
  {
    id: "free-entry",
    title: "Entering without donating or buying",
    source: "tenant",
    guidance:
      "The no-purchase entry method: where a free entry is sent, what it has to contain, one per person or otherwise, and how many tickets it earns. Wherever donating or buying improves somebody's odds, this is the section that most often has to exist.",
  },
  {
    id: "odds",
    title: "Odds of winning",
    source: "derived",
    guidance:
      "The chance an entry has, on whichever basis this promotion discloses — per bucket, per ticket colour, or across the whole promotion. Computed from the tickets issued at the moment the rules are published, and frozen there.",
  },
  {
    id: "prizes",
    title: "Prizes",
    source: "derived",
    guidance:
      "Each prize and its approximate retail value. Taken from the prizes recorded on this giveaway.",
  },
  {
    id: "drawing-and-notification",
    title: "The drawing, and how a winner is notified",
    source: "derived",
    guidance:
      "When and how the drawing happens, how a winner is contacted, and what happens to a prize nobody claims.",
  },
  {
    id: "winner-publication",
    title: "What is published about a winner",
    source: "tenant",
    guidance:
      "What the organization publishes about a winner — a name, a photograph, neither — where, and how somebody asks for a written list of winners instead.",
  },
  {
    id: "publicity-and-privacy",
    title: "Publicity and privacy",
    source: "tenant",
    guidance:
      "Whether entering permits the organization to use a winner's name or likeness, and on what terms. The privacy half is the platform's: what is collected is covered by the organization's privacy policy.",
  },
  {
    id: "void-where-prohibited",
    title: "Where this promotion is open",
    source: "tenant",
    guidance:
      "The places the promotion is open in, and the sentence voiding it everywhere it is not permitted.",
  },
  {
    id: "general-conditions",
    title: "General conditions",
    source: "platform",
    guidance:
      "What an entrant agrees to by entering, what happens if the promotion has to be changed or called off, and that the sponsor's decisions are final.",
  },
] as const;

export function giveawayRulesSection(
  id: string,
): GiveawayRulesSection | undefined {
  return GIVEAWAY_RULES_SECTIONS.find((section) => section.id === id);
}

/** The document's own title. Not a tenant answer: it is what these are called. */
export const GIVEAWAY_RULES_TITLE = "Official Rules";

/**
 * Which pool the odds are disclosed against.
 *
 * #666 asks which of the three a promotion is required to publish, and that is
 * a question for an organization's counsel rather than one the platform can
 * answer. The shared ticket pool (#5) can compute any of them, so the template
 * renders whichever this promotion picks rather than hard-coding one.
 */
export type OddsBasis = "bucket" | "colour" | "overall";

export const ODDS_BASES: readonly {
  value: OddsBasis;
  label: string;
  description: string;
}[] = [
  {
    value: "bucket",
    label: "Per draw bucket",
    description:
      "One line per bucket: the tickets in it against the prizes drawn from it. The most specific, and the closest to what an entrant is actually choosing between.",
  },
  {
    value: "colour",
    label: "Per ticket colour",
    description:
      "One line per ticket tier, across every bucket that tier can be dropped into.",
  },
  {
    value: "overall",
    label: "Across the whole promotion",
    description:
      "One line: every ticket issued against every prize on offer. The least specific of the three.",
  },
] as const;

export const DEFAULT_ODDS_BASIS: OddsBasis = "bucket";

export function isOddsBasis(value: unknown): value is OddsBasis {
  return ODDS_BASES.some((basis) => basis.value === value);
}

/* -------------------------------------------------------------------------
 * The tenant's answers
 * ---------------------------------------------------------------------- */

/**
 * Where an answer is stored: one `app_settings` row per question, per tenant,
 * in the same shape as `legal_publication.*` and `page_visibility.*`.
 *
 * Not `site_content`, and the difference is the publishing model rather than
 * the kind of text. A `site_content` slot is drafted and then published to the
 * public site; these answers reach no public page by themselves. They are
 * served only once a *giveaway's* rules are published, which is its own
 * deliberate act with its own freeze, so a second draft/publish cycle over the
 * answers would be a publish that publishes nothing. They are a decision about
 * the organization -- like putting a legal document in force -- which is what
 * the rest of Website > Site settings holds.
 *
 * Deliberately not one of the reserved public namespaces in
 * `@/lib/public-namespaces`: no view serves these to `anon`. What reaches the
 * public site is the frozen version row, never the live answer.
 */
export const GIVEAWAY_RULES_SETTING_PREFIX = "giveaway_rules.";

export function giveawayRulesSettingKey(key: string): string {
  return `${GIVEAWAY_RULES_SETTING_PREFIX}${key}`;
}

export type GiveawayRulesAnswerField = {
  /** The suffix after `giveaway_rules.` in `app_settings`. */
  key: string;
  label: string;
  /** A single line, or a block of paragraphs. */
  kind: "text" | "paragraphs";
  /** What the organization is being asked, in the form. */
  help: string;
  /**
   * What an organization that has not answered sees in the preview, as an
   * example of the shape of the answer. It is never published: a section
   * standing on an unanswered question blocks the publish (`rulesReadiness`).
   */
  placeholder: string;
  /** Which sections are unanswered without it. */
  sections: readonly string[];
};

/**
 * The questions, in the order the form asks them.
 *
 * Every one of them is a thing only the organization can answer. There are no
 * platform defaults here for the same reason `legal-defaults.ts` omits a
 * governing law: a number or an address the platform invented would be a
 * commitment made on a tenant's behalf, and an entrant would rely on it.
 */
export const GIVEAWAY_RULES_ANSWERS: readonly GiveawayRulesAnswerField[] = [
  {
    key: "sponsor_name",
    label: "Legal name of the sponsor",
    kind: "text",
    help: "The organization's full legal name, as it appears on its registration or filings — not the name it trades under, if those differ.",
    placeholder: "Example Organization, Inc.",
    sections: ["sponsor"],
  },
  {
    key: "sponsor_address",
    label: "Sponsor's address",
    kind: "paragraphs",
    help: "The postal address entrants and regulators can write to. One line per paragraph.",
    placeholder: "123 Example Street\nSuite 4\nExampleville, ST 00000",
    sections: ["sponsor"],
  },
  {
    key: "rules_contact",
    label: "Who to ask about these rules",
    kind: "text",
    help: "An email address, published in the rules, for questions about the promotion itself.",
    placeholder: "promotions@example.org",
    sections: ["sponsor", "drawing-and-notification"],
  },
  {
    key: "eligibility",
    label: "Who can enter",
    kind: "paragraphs",
    help: "Minimum age, and where an entrant has to live. Be specific: “18 or older” and “a legal resident of one of the states named below” are answers; “open to everyone” is not.",
    placeholder:
      "Entry is open to legal residents of the states named below who are 18 years of age or older at the time they enter.",
    sections: ["eligibility"],
  },
  {
    key: "exclusions",
    label: "Who cannot enter",
    kind: "paragraphs",
    help: "The people connected to the organization who are excluded, and who in their household is excluded with them.",
    placeholder:
      "Employees, board members and volunteers of the sponsor, and the members of their immediate households, may not enter.",
    sections: ["eligibility"],
  },
  {
    key: "operating_states",
    label: "Where the promotion is open",
    kind: "text",
    help: "The states or territories the promotion runs in, separated by commas. Everywhere else is void.",
    placeholder: "Colorado, Utah",
    sections: ["void-where-prohibited", "eligibility"],
  },
  {
    key: "free_entry",
    label: "Entering without donating or buying",
    kind: "paragraphs",
    help: "How somebody enters for free: where to send it, what it must contain, how many are allowed, and how many tickets one earns. Whether this is required of your organization is a question for your own counsel.",
    placeholder:
      "To enter without donating or buying a ticket package, mail a postcard with your name, address, email address and daytime telephone number to the sponsor's address above. Each postcard earns one ticket, and there is no limit on how many you may send. Postcards must be postmarked within the entry period.",
    sections: ["free-entry"],
  },
  {
    key: "winner_publication",
    label: "What is published about a winner",
    kind: "paragraphs",
    help: "What the organization publishes about a winner, where, for how long, and how somebody asks for the list of winners in writing instead.",
    placeholder:
      "The first name and last initial of each winner is published on the sponsor's website for 30 days after the drawing. For a written list of winners, write to the sponsor's address above within 60 days of the drawing.",
    sections: ["winner-publication"],
  },
  {
    key: "publicity",
    label: "Use of a winner's name or likeness",
    kind: "paragraphs",
    help: "Whether accepting a prize permits the organization to use the winner's name, photograph or statements, in what, and whether the winner may decline.",
    placeholder:
      "Accepting a prize permits the sponsor to use the winner's name, town and photograph in material about this promotion, without further payment, except where the law forbids it. A winner who would rather the sponsor did not may say so when the prize is claimed.",
    sections: ["publicity-and-privacy"],
  },
] as const;

export function giveawayRulesAnswerField(
  key: string,
): GiveawayRulesAnswerField | undefined {
  return GIVEAWAY_RULES_ANSWERS.find((answer) => answer.key === key);
}

/**
 * A tenant's answers, resolved. A question nobody has answered is absent
 * rather than empty, so "unanswered" and "deliberately blank" cannot be
 * confused -- the publish gate turns on exactly that distinction.
 */
export type GiveawayRulesAnswers = Record<string, string[]>;

/**
 * Reads whatever is stored under one answer key into paragraphs.
 *
 * Tolerant on the way in and strict on the way out: a string becomes one
 * paragraph, an array keeps its non-blank strings, and anything else -- a
 * number, an object, a row somebody typed into the table by hand -- is
 * unanswered. Blank-only answers resolve to unanswered too, which is what
 * makes clearing a field in the form the same act as never having filled it.
 */
export function resolveGiveawayRulesAnswer(value: unknown): string[] | null {
  const raw =
    typeof value === "string"
      ? value.split("\n")
      : Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : [];
  const paragraphs = raw.map((entry) => entry.trim()).filter(Boolean);
  return paragraphs.length ? paragraphs : null;
}

/** The whole answer set, from `app_settings` rows keyed by their full key. */
export function resolveGiveawayRulesAnswers(
  rows: readonly { key: string; value: unknown }[],
): GiveawayRulesAnswers {
  const answers: GiveawayRulesAnswers = {};
  for (const field of GIVEAWAY_RULES_ANSWERS) {
    const row = rows.find(
      (entry) => entry.key === giveawayRulesSettingKey(field.key),
    );
    const resolved = resolveGiveawayRulesAnswer(row?.value);
    if (resolved) answers[field.key] = resolved;
  }
  return answers;
}

/** The questions still to answer, in form order. */
export function unansweredGiveawayRules(
  answers: GiveawayRulesAnswers,
): GiveawayRulesAnswerField[] {
  return GIVEAWAY_RULES_ANSWERS.filter((field) => !answers[field.key]?.length);
}

/**
 * Caps on what one answer may hold, applied in the Server Action.
 *
 * Not validation so much as a bound: an answer is prose an organization wrote
 * and the platform has no business second-guessing its content, but one pasted
 * document should not become an `app_settings` row nobody can read or an
 * `audit_log` entry nobody can diff.
 */
export const GIVEAWAY_RULES_ANSWER_MAX_PARAGRAPHS = 20;
export const GIVEAWAY_RULES_ANSWER_MAX_LENGTH = 2000;
