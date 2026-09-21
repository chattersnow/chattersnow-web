import { formatCurrency } from "@/lib/format";
import {
  GIVEAWAY_RULES_ANSWERS,
  GIVEAWAY_RULES_SECTIONS,
  GIVEAWAY_RULES_TITLE,
  type GiveawayRulesAnswers,
  type GiveawayRulesSection,
  type OddsBasis,
} from "@/lib/giveaway-rules";

/**
 * The prose half of the official-rules template (#1322): what a section says
 * once the organization's answers and the promotion's own numbers are in hand.
 *
 * The registry in `@/lib/giveaway-rules.ts` says which sections exist and
 * where each one's content comes from; this builds the document. The same
 * three rules `src/lib/legal-defaults.ts` holds itself to apply, because the
 * hazard is identical -- text published under an organization's name that the
 * organization never agreed to:
 *
 *   1. **Only what the software does, or what the organization has said.**
 *      Every derived sentence below is about rows in this database. Where only
 *      the organization can answer, the section is absent and the publish is
 *      refused rather than the sentence being guessed at.
 *   2. **No commitments on a tenant's behalf.** No claim periods, no notice
 *      windows, no governing law -- the numbers an entrant would rely on are
 *      the organization's to set, and `legal-defaults.ts` omits exactly the
 *      same things for exactly this reason.
 *   3. **No borrowed boilerplate that is not true here.** In particular the
 *      canonical sweepstakes line -- "no purchase necessary, and a purchase
 *      will not improve your chances of winning" -- is only half true of this
 *      software: the tier system (#5) is *designed* so that a larger donation
 *      earns a better bundle. The template says so plainly instead. Printing
 *      the familiar sentence over a weighted promotion would be the worst
 *      thing in this file.
 *
 * Output is `GiveawayRulesDocument`, which is the shape frozen into a version
 * row at publish and the shape the public page renders. Paragraphs may carry
 * the small markup `src/lib/legal-markup.ts` parses -- bullets, links and bold
 * -- and nothing else.
 */

/** The organization, as the rules name it. */
export type GiveawayRulesOrg = {
  /** `tenants.name`, used only where the sponsor's legal name is absent. */
  name: string;
};

export type GiveawayRulesPrize = {
  name: string;
  /** `giveaway_prizes.estimated_value`, the approximate retail value. */
  value: number | null;
  /** The draw bucket it is pulled from, where the giveaway uses buckets. */
  bucket: string | null;
};

export type GiveawayRulesOddsRow = {
  label: string;
  tickets: number;
  prizes: number;
  /**
   * Whether `tickets` is the most that could be in this pool rather than the
   * number that are.
   *
   * Per-bucket odds are the case, and the reason is #5's design rather than a
   * gap in the data: ticket placement is physical. The system records that a
   * gold ticket was issued; which of the gold buckets somebody dropped it into
   * is known only to the bucket. So the tickets counted against a bucket are
   * every ticket of its colour -- the worst case, since a ticket's chance can
   * only improve as fewer of them share its bucket -- and the prose says "no
   * worse than" rather than stating a figure the urn could contradict.
   */
  ticketsAreUpperBound: boolean;
};

export type GiveawayRulesPackage = {
  name: string;
  price: number;
  /** "3 gold, 1 silver and 1 bronze", already assembled. */
  tickets: string;
};

export type GiveawayRulesTierGrant = {
  label: string;
  tickets: string;
};

/**
 * The promotion's own numbers, read by `@/lib/giveaway-rules-facts.ts`.
 *
 * Dates arrive already formatted, in the event's own timezone rather than the
 * reader's: a promotion's entry period is a fact about where it runs, and the
 * public site renders event times in the event's zone. Formatting them here
 * would mean formatting them again on every render, which is the opposite of
 * freezing.
 */
export type GiveawayRulesFacts = {
  /** What the promotion is called -- the giveaway's name, or its event's. */
  promotionName: string;
  eventName: string;
  /**
   * The timezone every date in the document was written in -- the event's own
   * (`events.timezone`). Frozen with the text, so the effective date renders
   * in the promotion's zone forever rather than in whichever zone the server
   * rendering the page happens to be in.
   */
  timeZone: string;
  /** Formatted, with a zone abbreviation. Null when the event has no end. */
  entryOpens: string | null;
  entryCloses: string | null;
  /** Formatted. Null when no drawing date has been recorded. */
  drawingDate: string | null;
  prizes: readonly GiveawayRulesPrize[];
  packages: readonly GiveawayRulesPackage[];
  /** One per tier a donated item can be classified into, with its bundle. */
  donationTiers: readonly GiveawayRulesTierGrant[];
  odds: {
    basis: OddsBasis;
    rows: readonly GiveawayRulesOddsRow[];
  };
};

/** A section rewritten for this one promotion, keyed by section id. */
export type GiveawayRulesOverrides = Record<string, string[]>;

export type GiveawayRulesDocumentSection = {
  id: string;
  title: string;
  paragraphs: string[];
};

export type GiveawayRulesDocument = {
  title: string;
  /** The instant this version took effect. Set by the publish, not here. */
  effective_at: string;
  /** The zone `effective_at` and every date in the text are rendered in. */
  time_zone: string;
  summary: string[];
  sections: GiveawayRulesDocumentSection[];
};

export type GiveawayRulesInput = {
  org: GiveawayRulesOrg;
  answers: GiveawayRulesAnswers;
  facts: GiveawayRulesFacts;
  overrides: GiveawayRulesOverrides;
};

const bullets = (items: readonly string[]) =>
  items.map((item) => `- ${item}`).join("\n");

/** The sponsor as the document names it: its legal name, or the tenant's. */
function sponsor(input: GiveawayRulesInput): string {
  return input.answers.sponsor_name?.[0] ?? input.org.name;
}

/**
 * "1 in 42" from tickets and prizes, or null when the ratio says nothing --
 * no tickets issued, or nothing to win.
 *
 * One decimal place, and only when it earns it: "1 in 42" reads as a fact and
 * "1 in 42.0" reads as a rounding error.
 */
export function oddsRatio(tickets: number, prizes: number): string | null {
  if (!Number.isFinite(tickets) || !Number.isFinite(prizes)) return null;
  if (tickets <= 0 || prizes <= 0) return null;
  const ratio = tickets / prizes;
  const rounded = Math.round(ratio * 10) / 10;
  return `1 in ${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}`;
}

const ODDS_INTRO: Record<OddsBasis, string> = {
  bucket:
    "You choose which bucket to drop each ticket into, and a ticket competes only against the other tickets in that bucket. Nobody counts the tickets inside a bucket before the drawing, so what is published below is the worst case for each one: every ticket of that colour counted as though it were in that bucket. As of the date at the top of these rules:",
  colour:
    "Tickets come in colours, and the chance a ticket has depends on its colour. As of the date at the top of these rules:",
  overall:
    "Every ticket entered in this promotion is counted together. As of the date at the top of these rules:",
};

/**
 * The prose for one section, or null when it cannot be written from what is
 * known. Null is what stops the publish: a section that has to say something
 * and cannot is not something to paper over with a placeholder.
 */
function sectionProse(
  section: GiveawayRulesSection,
  input: GiveawayRulesInput,
): string[] | null {
  const { answers, facts } = input;

  switch (section.id) {
    case "sponsor": {
      if (!answers.sponsor_name || !answers.sponsor_address) return null;
      const contact = answers.rules_contact?.[0];
      return [
        `This promotion is run by **${answers.sponsor_name[0]}** (“the sponsor”). These rules are an agreement between you and the sponsor.`,
        `The sponsor can be written to at:`,
        bullets(answers.sponsor_address),
        ...(contact
          ? [
              `Questions about these rules go to [${contact}](mailto:${contact}).`,
            ]
          : []),
      ];
    }

    case "eligibility": {
      if (!answers.eligibility || !answers.exclusions) return null;
      return [...answers.eligibility, ...answers.exclusions];
    }

    case "entry-period": {
      if (!facts.entryOpens) return null;
      return [
        facts.entryCloses
          ? `Entries are accepted from ${facts.entryOpens} until ${facts.entryCloses}. An entry earned after that is not entered in the drawing.`
          : `Entries are accepted at ${facts.eventName}, on ${facts.entryOpens}.`,
        "Every time in these rules is given in the timezone shown beside it, which is the timezone the promotion runs in.",
      ];
    }

    case "how-to-enter": {
      const ways: string[] = [];
      for (const pkg of facts.packages) {
        ways.push(
          `**${pkg.name}** — ${formatCurrency(pkg.price)}, which earns ${pkg.tickets}.`,
        );
      }
      for (const tier of facts.donationTiers) {
        ways.push(
          `**Donating ${tier.label.toLowerCase()}-tier gear** — each item donated is classified when it is handed over, and every item earns its own tickets: ${tier.tickets}.`,
        );
      }
      if (!ways.length) return null;
      return [
        "Tickets are earned, and each ticket is one entry. There is more than one way to earn them:",
        bullets(ways),
        // The honest version of the sentence every set of sweepstakes rules
        // carries. See rule 3 at the top of this file.
        "How much you donate or buy changes how many tickets you earn, and therefore your chances — that is how this promotion is designed. You can also enter without donating or buying anything: see “Entering without donating or buying” below.",
        "Tickets are handed over at the event and dropped into the bucket you choose. A ticket you do not drop into a bucket is not entered in the drawing.",
      ];
    }

    case "free-entry":
      return answers.free_entry ?? null;

    case "odds": {
      const rows = facts.odds.rows
        .map((row) => {
          const ratio = oddsRatio(row.tickets, row.prizes);
          if (!ratio) return null;
          const tickets = `${row.tickets.toLocaleString("en-US")} ${row.tickets === 1 ? "ticket" : "tickets"}`;
          const prizes = `${row.prizes.toLocaleString("en-US")} ${row.prizes === 1 ? "prize" : "prizes"}`;
          return row.ticketsAreUpperBound
            ? `**${row.label}** — ${prizes} drawn from it, and at most ${tickets} can have been entered in it: a ticket in this bucket has a chance no worse than ${ratio}.`
            : `**${row.label}** — ${tickets} entered, ${prizes} to be drawn: ${ratio} per ticket.`;
        })
        .filter((row): row is string => row !== null);
      if (!rows.length) return null;
      return [
        ODDS_INTRO[facts.odds.basis],
        bullets(rows),
        "These figures were worked out from the tickets that had been issued when this version of the rules was published, and they do not change afterwards. The chance a ticket actually has depends on how many entries there are in total by the time of the drawing.",
      ];
    }

    case "prizes": {
      if (!facts.prizes.length) return null;
      const lines = facts.prizes.map((prize) => {
        const value =
          prize.value === null
            ? "approximate retail value not established"
            : `approximate retail value ${formatCurrency(prize.value)}`;
        const bucket = prize.bucket ? `, drawn from ${prize.bucket}` : "";
        return `**${prize.name}** — ${value}${bucket}.`;
      });
      const total = facts.prizes.reduce(
        (sum, prize) => sum + (prize.value ?? 0),
        0,
      );
      const everyValueKnown = facts.prizes.every(
        (prize) => prize.value !== null,
      );
      return [
        `${facts.prizes.length === 1 ? "One prize is" : `${facts.prizes.length} prizes are`} being given away:`,
        bullets(lines),
        ...(everyValueKnown && total > 0
          ? [
              `The approximate retail value of everything being given away is ${formatCurrency(total)}. A value given here is the sponsor's good-faith estimate of what the item would sell for; what it is actually worth may differ, and no cash alternative is offered.`,
            ]
          : [
              "A value given here is the sponsor's good-faith estimate of what the item would sell for; what it is actually worth may differ, and no cash alternative is offered.",
            ]),
      ];
    }

    case "drawing-and-notification": {
      if (!facts.drawingDate) return null;
      const contact = answers.rules_contact?.[0];
      return [
        `The drawing is held on ${facts.drawingDate}. Winning tickets are drawn at random, by hand, from the tickets entered — from each bucket separately where the promotion uses buckets.`,
        "A winner is contacted using the details recorded when they entered. The sponsor will say, when it notifies a winner, how long that winner has to claim the prize and what it needs from them; a prize that goes unclaimed by then may be drawn again or kept.",
        ...(contact
          ? [
              `If you think you have won and have not heard anything, write to [${contact}](mailto:${contact}).`,
            ]
          : []),
      ];
    }

    case "winner-publication":
      return answers.winner_publication ?? null;

    case "publicity-and-privacy": {
      if (!answers.publicity) return null;
      return [
        ...answers.publicity,
        "What the sponsor collects from you when you enter, how long it keeps it, and how to ask for a copy or a deletion, is covered by its [privacy policy](/privacy).",
      ];
    }

    case "void-where-prohibited": {
      const states = answers.operating_states?.[0];
      if (!states) return null;
      return [
        `This promotion is open in ${states} only. It is void everywhere else, and wherever it is prohibited or restricted by law.`,
        "Nothing in these rules overrides a law that applies to the promotion where you live.",
      ];
    }

    case "general-conditions":
      return [
        "Entering means you accept these rules and the sponsor's decisions, which are final in everything to do with this promotion.",
        "The sponsor may change these rules, or suspend or call off the promotion, if something outside its control makes it impossible to run as described. A change is published as a new version of this page with its own effective date, and earlier versions stay readable here — the version in force when you entered is the one that governs your entry.",
        "A prize cannot be exchanged for cash and cannot be transferred to somebody else. If a prize becomes unavailable before it is handed over, the sponsor may substitute one of equal or greater value.",
        "Any tax owed on a prize is the winner's responsibility.",
        "An entry that is incomplete, or that is made by anyone the rules exclude, may be disqualified.",
      ];

    default:
      return null;
  }
}

/**
 * Whether a section can be published, and what is missing when it cannot.
 *
 * An override settles it: a section somebody has written for this promotion
 * needs nothing else. Otherwise the section stands on its answers and its
 * numbers, and a section that has neither reports what it wants -- by the
 * label on the form field, so the reason is something to act on rather than a
 * section id.
 */
export type GiveawayRulesGap = {
  sectionId: string;
  sectionTitle: string;
  missing: string;
};

export function giveawayRulesGaps(
  input: GiveawayRulesInput,
): GiveawayRulesGap[] {
  const gaps: GiveawayRulesGap[] = [];
  for (const section of GIVEAWAY_RULES_SECTIONS) {
    if (input.overrides[section.id]?.length) continue;
    // `?.length`, not truthiness: an empty array is a section that resolved to
    // nothing, and `[]` is truthy. An answer cleared in the form arrives as an
    // empty array, so this is the ordinary case rather than a defensive one.
    if (sectionProse(section, input)?.length) continue;
    gaps.push({
      sectionId: section.id,
      sectionTitle: section.title,
      missing:
        section.source === "tenant"
          ? unansweredFor(section.id, input.answers)
          : (DERIVED_GAPS[section.id] ??
            "Nothing recorded on this giveaway to write it from."),
    });
  }
  return gaps;
}

/** What a derived section wants from the giveaway before it can be written. */
const DERIVED_GAPS: Record<string, string> = {
  "entry-period": "The event this giveaway belongs to has no start date.",
  "how-to-enter":
    "No ticket packages and no ticket tiers, so there is no way to enter to describe.",
  odds: "No tickets have been issued, or no prizes are recorded, so there are no odds to state.",
  prizes: "No prizes are recorded on this giveaway.",
  "drawing-and-notification": "This giveaway has no drawing date.",
};

function unansweredFor(
  sectionId: string,
  answers: GiveawayRulesAnswers,
): string {
  const missing = GIVEAWAY_RULES_ANSWERS.filter(
    (field) =>
      field.sections.includes(sectionId) && !answers[field.key]?.length,
  ).map((field) => field.label.toLowerCase());
  return missing.length
    ? `Not answered yet: ${missing.join(", ")}.`
    : "Not answered yet.";
}

/**
 * The whole document, ready to freeze.
 *
 * A section with no override and nothing to say is **left out** rather than
 * rendered empty, which keeps the rail and the anchors honest -- the same
 * stance `platformLegalDocument()` takes. The publish gate means a published
 * document never reaches that state, but a preview of a half-answered set of
 * rules does, and it should show what is actually there.
 */
export function buildGiveawayRules(
  input: GiveawayRulesInput,
  effectiveAt: string,
): GiveawayRulesDocument {
  const sections: GiveawayRulesDocumentSection[] = [];
  for (const section of GIVEAWAY_RULES_SECTIONS) {
    const paragraphs =
      input.overrides[section.id]?.filter(Boolean) ??
      sectionProse(section, input);
    if (!paragraphs?.length) continue;
    sections.push({
      id: section.id,
      title: section.title,
      paragraphs,
    });
  }

  return {
    title: GIVEAWAY_RULES_TITLE,
    effective_at: effectiveAt,
    time_zone: input.facts.timeZone,
    summary: [
      `These are the official rules for ${input.facts.promotionName}, run by ${sponsor(input)}. They say who can enter, how an entry is earned, what is being given away, what the chances are, and how a winner is picked.`,
      "Read them before you enter. Entering means you accept them.",
    ],
    sections,
  };
}
