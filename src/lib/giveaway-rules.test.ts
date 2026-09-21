import { describe, expect, test } from "bun:test";
import {
  GIVEAWAY_RULES_ANSWERS,
  GIVEAWAY_RULES_SECTIONS,
  giveawayRulesAnswerField,
  giveawayRulesSection,
  giveawayRulesSettingKey,
  isOddsBasis,
  ODDS_BASES,
  resolveGiveawayRulesAnswer,
  resolveGiveawayRulesAnswers,
  unansweredGiveawayRules,
} from "@/lib/giveaway-rules";

describe("the section registry", () => {
  test("every section id is unique and usable as an anchor", () => {
    const ids = GIVEAWAY_RULES_SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  test("every section says what it has to say", () => {
    for (const section of GIVEAWAY_RULES_SECTIONS) {
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.guidance.length).toBeGreaterThan(20);
    }
  });

  test("the free entry method is not buried under the boilerplate", () => {
    const ids = GIVEAWAY_RULES_SECTIONS.map((section) => section.id);
    expect(ids.indexOf("free-entry")).toBeLessThan(
      ids.indexOf("general-conditions"),
    );
  });

  test("lookup finds a section and refuses an invented one", () => {
    expect(giveawayRulesSection("odds")?.title).toBeString();
    expect(giveawayRulesSection("nope")).toBeUndefined();
  });
});

describe("the tenant's questions", () => {
  test("every answer feeds at least one section that exists", () => {
    const ids = new Set(GIVEAWAY_RULES_SECTIONS.map((section) => section.id));
    for (const field of GIVEAWAY_RULES_ANSWERS) {
      expect(field.sections.length).toBeGreaterThan(0);
      for (const id of field.sections) expect(ids.has(id)).toBe(true);
    }
  });

  // A tenant-sourced section with nothing feeding it could never be published
  // and could never be explained: the gap would name no question to answer.
  test("every tenant-sourced section has a question behind it", () => {
    for (const section of GIVEAWAY_RULES_SECTIONS) {
      if (section.source !== "tenant") continue;
      const fields = GIVEAWAY_RULES_ANSWERS.filter((field) =>
        field.sections.includes(section.id),
      );
      expect(fields.length).toBeGreaterThan(0);
    }
  });

  test("answer keys are unique and prefix cleanly", () => {
    const keys = GIVEAWAY_RULES_ANSWERS.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(giveawayRulesSettingKey("sponsor_name")).toBe(
      "giveaway_rules.sponsor_name",
    );
    // The stored key has to satisfy `site_content`/`app_settings`' key shape.
    for (const key of keys) {
      expect(giveawayRulesSettingKey(key)).toMatch(
        /^[a-z0-9_]+(\.[a-z0-9_]+)*$/,
      );
    }
  });

  test("lookup refuses a key nobody was asked", () => {
    expect(giveawayRulesAnswerField("sponsor_name")).toBeDefined();
    expect(giveawayRulesAnswerField("governing_law")).toBeUndefined();
  });
});

describe("resolving a stored answer", () => {
  test("a string becomes one paragraph", () => {
    expect(resolveGiveawayRulesAnswer("Example Org")).toEqual(["Example Org"]);
  });

  test("newlines in a stored string become paragraphs", () => {
    expect(resolveGiveawayRulesAnswer("One\nTwo")).toEqual(["One", "Two"]);
  });

  test("an array keeps its non-blank strings", () => {
    expect(resolveGiveawayRulesAnswer(["  a ", "", "b"])).toEqual(["a", "b"]);
  });

  // Unanswered and deliberately blank are the same thing here on purpose: the
  // publish gate reads both as "nothing to publish", so clearing a field is
  // the same act as never having filled it in.
  test("blank, empty and nonsense all mean unanswered", () => {
    expect(resolveGiveawayRulesAnswer("   ")).toBeNull();
    expect(resolveGiveawayRulesAnswer([])).toBeNull();
    expect(resolveGiveawayRulesAnswer(null)).toBeNull();
    expect(resolveGiveawayRulesAnswer(42)).toBeNull();
    expect(resolveGiveawayRulesAnswer({ sponsor: "x" })).toBeNull();
  });

  test("the whole set reads off app_settings rows and ignores strangers", () => {
    const answers = resolveGiveawayRulesAnswers([
      { key: "giveaway_rules.sponsor_name", value: ["Example Org"] },
      { key: "giveaway_rules.made_up", value: ["ignored"] },
      { key: "legal_publication.terms", value: true },
    ]);
    expect(answers).toEqual({ sponsor_name: ["Example Org"] });
  });

  test("what is still unanswered is reported in form order", () => {
    const missing = unansweredGiveawayRules({ sponsor_name: ["Example Org"] });
    expect(missing.map((field) => field.key)).toEqual(
      GIVEAWAY_RULES_ANSWERS.filter(
        (field) => field.key !== "sponsor_name",
      ).map((field) => field.key),
    );
  });
});

describe("the odds basis", () => {
  test("only the three the template can render are accepted", () => {
    for (const basis of ODDS_BASES) expect(isOddsBasis(basis.value)).toBe(true);
    expect(isOddsBasis("per-entrant")).toBe(false);
    expect(isOddsBasis(undefined)).toBe(false);
  });
});
