import { describe, expect, test } from "bun:test";
import {
  suggestedProgramIds,
  type ProgramSuggestionRule,
} from "./program-suggestion-shared";

const PROGRAM_A = "11111111-1111-1111-1111-111111111111";
const PROGRAM_B = "22222222-2222-2222-2222-222222222222";
const PROGRAM_C = "33333333-3333-3333-3333-333333333333";

describe("suggestedProgramIds", () => {
  test("matches a category-only rule regardless of item type", () => {
    const rules: ProgramSuggestionRule[] = [
      {
        id: "r1",
        item_type: null,
        category: "lgbtq_community",
        program_id: PROGRAM_A,
        note: null,
      },
    ];
    expect(
      suggestedProgramIds(rules, "fundraiser", ["lgbtq_community"], []),
    ).toEqual([PROGRAM_A]);
  });

  test("matches an item-type-only rule regardless of category", () => {
    const rules: ProgramSuggestionRule[] = [
      {
        id: "r1",
        item_type: "partner_event",
        category: null,
        program_id: PROGRAM_A,
        note: null,
      },
    ];
    expect(suggestedProgramIds(rules, "partner_event", [], [])).toEqual([
      PROGRAM_A,
    ]);
  });

  test("requires both dimensions when a rule specifies both", () => {
    const rules: ProgramSuggestionRule[] = [
      {
        id: "r1",
        item_type: "community_observance",
        category: "lgbtq_community",
        program_id: PROGRAM_A,
        note: null,
      },
    ];
    expect(
      suggestedProgramIds(
        rules,
        "community_observance",
        ["winter_outdoor_sports"],
        [],
      ),
    ).toEqual([]);
    expect(
      suggestedProgramIds(
        rules,
        "community_observance",
        ["lgbtq_community"],
        [],
      ),
    ).toEqual([PROGRAM_A]);
  });

  test("excludes programs already on the item", () => {
    const rules: ProgramSuggestionRule[] = [
      {
        id: "r1",
        item_type: null,
        category: "lgbtq_community",
        program_id: PROGRAM_A,
        note: null,
      },
    ];
    expect(
      suggestedProgramIds(
        rules,
        "community_observance",
        ["lgbtq_community"],
        [PROGRAM_A],
      ),
    ).toEqual([]);
  });

  test("de-duplicates a program suggested by more than one matching rule", () => {
    const rules: ProgramSuggestionRule[] = [
      {
        id: "r1",
        item_type: null,
        category: "lgbtq_community",
        program_id: PROGRAM_A,
        note: null,
      },
      {
        id: "r2",
        item_type: "community_observance",
        category: null,
        program_id: PROGRAM_A,
        note: null,
      },
    ];
    expect(
      suggestedProgramIds(
        rules,
        "community_observance",
        ["lgbtq_community"],
        [],
      ),
    ).toEqual([PROGRAM_A]);
  });

  test("returns no suggestions when nothing matches", () => {
    const rules: ProgramSuggestionRule[] = [
      {
        id: "r1",
        item_type: "fundraiser",
        category: null,
        program_id: PROGRAM_A,
        note: null,
      },
    ];
    expect(suggestedProgramIds(rules, "community_observance", [], [])).toEqual(
      [],
    );
  });

  test("collects suggestions from multiple independently-matching rules", () => {
    const rules: ProgramSuggestionRule[] = [
      {
        id: "r1",
        item_type: null,
        category: "lgbtq_community",
        program_id: PROGRAM_A,
        note: null,
      },
      {
        id: "r2",
        item_type: null,
        category: "community_social_justice",
        program_id: PROGRAM_B,
        note: null,
      },
      {
        id: "r3",
        item_type: null,
        category: "winter_outdoor_sports",
        program_id: PROGRAM_C,
        note: null,
      },
    ];
    expect(
      suggestedProgramIds(
        rules,
        "community_observance",
        ["lgbtq_community", "community_social_justice"],
        [],
      ),
    ).toEqual([PROGRAM_A, PROGRAM_B]);
  });
});
