import { describe, expect, test } from "bun:test";
import { GIVEAWAY_RULES_SECTIONS } from "@/lib/giveaway-rules";
import {
  buildGiveawayRules,
  giveawayRulesGaps,
  oddsRatio,
  type GiveawayRulesFacts,
  type GiveawayRulesInput,
} from "@/lib/giveaway-rules-template";
import { legalPlainText, parseLegalBlocks } from "@/lib/legal-markup";

const FACTS: GiveawayRulesFacts = {
  promotionName: "Trailhead Cleanup Giveaway",
  eventName: "Trailhead Cleanup",
  timeZone: "America/Denver",
  entryOpens: "Jul 12, 2026, 9:00 AM MDT",
  entryCloses: "Jul 12, 2026, 4:00 PM MDT",
  drawingDate: "Jul 12, 2026",
  prizes: [
    { name: "Weekend cabin stay", value: 400, bucket: "Gold bucket" },
    { name: "Gift basket", value: 60, bucket: "Silver bucket" },
  ],
  packages: [
    { name: "Handful", price: 20, tickets: "3 gold and 1 silver tickets" },
  ],
  donationTiers: [
    { label: "Gold", tickets: "3 gold, 1 silver and 1 bronze tickets" },
  ],
  odds: {
    basis: "colour",
    rows: [
      {
        label: "Gold tickets",
        tickets: 48,
        prizes: 1,
        ticketsAreUpperBound: false,
      },
    ],
  },
};

const ANSWERS = {
  sponsor_name: ["Example Nonprofit, Inc."],
  sponsor_address: ["Example Nonprofit, Inc.", "1200 Mountain Road"],
  rules_contact: ["promotions@example.org"],
  eligibility: ["Open to residents of the states named below, 18 or older."],
  exclusions: ["Employees and board members may not enter."],
  operating_states: ["Colorado and Utah"],
  free_entry: ["Mail a postcard to the address above."],
  winner_publication: ["We publish a first name and last initial."],
  publicity: ["Accepting a prize permits us to use the winner's name."],
};

const COMPLETE: GiveawayRulesInput = {
  org: { name: "Example Nonprofit" },
  answers: ANSWERS,
  facts: FACTS,
  overrides: {},
};

const EFFECTIVE = "2026-07-01T16:00:00.000Z";

function textOf(input: GiveawayRulesInput, sectionId: string): string {
  const section = buildGiveawayRules(input, EFFECTIVE).sections.find(
    (entry) => entry.id === sectionId,
  );
  return section ? legalPlainText(section.paragraphs) : "";
}

describe("a complete set of rules", () => {
  test("publishes every section, in registry order", () => {
    const doc = buildGiveawayRules(COMPLETE, EFFECTIVE);
    expect(doc.sections.map((section) => section.id)).toEqual(
      GIVEAWAY_RULES_SECTIONS.map((section) => section.id),
    );
    expect(giveawayRulesGaps(COMPLETE)).toEqual([]);
  });

  test("freezes the effective date and the zone it was written in", () => {
    const doc = buildGiveawayRules(COMPLETE, EFFECTIVE);
    expect(doc.effective_at).toBe(EFFECTIVE);
    expect(doc.time_zone).toBe("America/Denver");
  });

  test("names the sponsor rather than the tenant", () => {
    expect(textOf(COMPLETE, "sponsor")).toContain("Example Nonprofit, Inc.");
    const doc = buildGiveawayRules(COMPLETE, EFFECTIVE);
    expect(doc.summary.join(" ")).toContain("Example Nonprofit, Inc.");
  });

  // The most important assertion in this file. The canonical sweepstakes line
  // is false of a promotion whose tiers are designed so a larger donation
  // earns more tickets, and printing it would be the worst thing the template
  // could do.
  test("never claims that donating or buying does not improve the odds", () => {
    const doc = buildGiveawayRules(COMPLETE, EFFECTIVE);
    const whole = legalPlainText([
      ...doc.summary,
      ...doc.sections.flatMap((section) => section.paragraphs),
    ]).toLowerCase();
    expect(whole).not.toContain("will not improve your chances");
    expect(whole).not.toContain("no purchase necessary");
    expect(textOf(COMPLETE, "how-to-enter")).toContain(
      "changes how many tickets you earn",
    );
  });

  test("points at the free entry method from how to enter", () => {
    expect(textOf(COMPLETE, "how-to-enter")).toContain(
      "without donating or buying",
    );
  });

  // Everything `legal-defaults.ts` refuses to commit a tenant to, this refuses
  // too: no governing law, no claim window, no notice period.
  test("commits the organization to no number it did not give", () => {
    const doc = buildGiveawayRules(COMPLETE, EFFECTIVE);
    const platform = doc.sections
      .filter((section) =>
        ["drawing-and-notification", "general-conditions"].includes(section.id),
      )
      .flatMap((section) => section.paragraphs);
    const text = legalPlainText(platform).toLowerCase();
    expect(text).not.toContain("governed by the laws");
    expect(text).not.toMatch(/within \d+ days/);
  });

  test("the privacy half points at the privacy policy", () => {
    const blocks = parseLegalBlocks(
      buildGiveawayRules(COMPLETE, EFFECTIVE).sections.find(
        (section) => section.id === "publicity-and-privacy",
      )!.paragraphs,
    );
    const links = blocks.flatMap((block) =>
      block.kind === "paragraph"
        ? block.runs.filter((run) => run.kind === "link")
        : [],
    );
    expect(links.map((link) => (link as { href: string }).href)).toContain(
      "/privacy",
    );
  });
});

describe("what stops a publish", () => {
  test("an unanswered question names itself, by the label on the form", () => {
    const input = {
      ...COMPLETE,
      answers: { ...ANSWERS, free_entry: [] },
    };
    const gaps = giveawayRulesGaps(input);
    expect(gaps.map((gap) => gap.sectionId)).toEqual(["free-entry"]);
    expect(gaps[0].missing.toLowerCase()).toContain("without donating");
  });

  test("a giveaway with no prizes cannot publish a prize section", () => {
    const input = {
      ...COMPLETE,
      facts: {
        ...FACTS,
        prizes: [],
        odds: { basis: "colour" as const, rows: [] },
      },
    };
    const gaps = giveawayRulesGaps(input);
    expect(gaps.map((gap) => gap.sectionId).sort()).toEqual(["odds", "prizes"]);
  });

  test("a missing drawing date is reported against its own section", () => {
    const gaps = giveawayRulesGaps({
      ...COMPLETE,
      facts: { ...FACTS, drawingDate: null },
    });
    expect(gaps.map((gap) => gap.sectionId)).toEqual([
      "drawing-and-notification",
    ]);
  });

  // A section with nothing to say is left out rather than published empty, so
  // the rail and the anchors never point at a heading with no body.
  test("a section that cannot be written is absent from the document", () => {
    const doc = buildGiveawayRules(
      { ...COMPLETE, answers: { ...ANSWERS, free_entry: [] } },
      EFFECTIVE,
    );
    expect(doc.sections.map((section) => section.id)).not.toContain(
      "free-entry",
    );
  });

  test("an override settles a section nothing else could fill", () => {
    const input = {
      ...COMPLETE,
      answers: { ...ANSWERS, free_entry: [] },
      overrides: {
        "free-entry": ["Write to us and we will send you a ticket."],
      },
    };
    expect(giveawayRulesGaps(input)).toEqual([]);
    expect(textOf(input, "free-entry")).toBe(
      "Write to us and we will send you a ticket.",
    );
  });
});

describe("odds", () => {
  test("a ratio is a whole number where it can be", () => {
    expect(oddsRatio(48, 1)).toBe("1 in 48");
    expect(oddsRatio(100, 3)).toBe("1 in 33.3");
  });

  test("nothing issued and nothing to win produce no ratio at all", () => {
    expect(oddsRatio(0, 2)).toBeNull();
    expect(oddsRatio(20, 0)).toBeNull();
  });

  // Per-bucket odds are a floor on the chance, not a statement of it: which
  // bucket a ticket went into is not recorded anywhere, so the rules say "no
  // worse than" rather than a figure the urn could contradict.
  test("a bucket's tickets are published as an upper bound", () => {
    const text = textOf(
      {
        ...COMPLETE,
        facts: {
          ...FACTS,
          odds: {
            basis: "bucket",
            rows: [
              {
                label: "Gold bucket",
                tickets: 48,
                prizes: 1,
                ticketsAreUpperBound: true,
              },
            ],
          },
        },
      },
      "odds",
    );
    expect(text).toContain("at most");
    expect(text).toContain("no worse than 1 in 48");
  });

  test("published odds say they were worked out at publication", () => {
    expect(textOf(COMPLETE, "odds")).toContain(
      "when this version of the rules was published",
    );
  });
});

describe("derived text", () => {
  test("the prize list carries every value and their total", () => {
    const text = textOf(COMPLETE, "prizes");
    expect(text).toContain("Weekend cabin stay");
    expect(text).toContain("$400.00");
    expect(text).toContain("$460.00");
  });

  test("a prize with no value is said to have none rather than $0", () => {
    const text = textOf(
      {
        ...COMPLETE,
        facts: {
          ...FACTS,
          prizes: [{ name: "Mystery box", value: null, bucket: null }],
        },
      },
      "prizes",
    );
    expect(text).toContain("approximate retail value not established");
    expect(text).not.toContain("$0.00");
  });

  test("the entry period names both ends and the zone convention", () => {
    const text = textOf(COMPLETE, "entry-period");
    expect(text).toContain("Jul 12, 2026, 9:00 AM MDT");
    expect(text).toContain("Jul 12, 2026, 4:00 PM MDT");
  });

  test("an event with no end date says where entries are taken instead", () => {
    const text = textOf(
      { ...COMPLETE, facts: { ...FACTS, entryCloses: null } },
      "entry-period",
    );
    expect(text).toContain("Trailhead Cleanup");
  });
});
