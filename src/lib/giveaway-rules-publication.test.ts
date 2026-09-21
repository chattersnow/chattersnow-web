import { describe, expect, test } from "bun:test";
import {
  selectGiveawayRulesVersion,
  type PublishedGiveawayRules,
} from "@/lib/giveaway-rules-publication";

const version = (n: number): PublishedGiveawayRules => ({
  version: n,
  effective_at: `2026-07-0${n}T16:00:00.000Z`,
  content: {
    title: "Official Rules",
    effective_at: `2026-07-0${n}T16:00:00.000Z`,
    time_zone: "America/Denver",
    summary: [],
    sections: [],
  },
});

// Newest first, as the read returns them.
const VERSIONS = [version(3), version(2), version(1)];

describe("which version a request gets", () => {
  test("no version asked for is the one in force", () => {
    expect(selectGiveawayRulesVersion(VERSIONS)?.version).toBe(3);
    expect(selectGiveawayRulesVersion(VERSIONS, null)?.version).toBe(3);
    expect(selectGiveawayRulesVersion(VERSIONS, "")?.version).toBe(3);
  });

  // The whole reason superseded versions stay readable: somebody who entered
  // under version 1 has to be able to find version 1.
  test("an earlier version is served when it is asked for", () => {
    expect(selectGiveawayRulesVersion(VERSIONS, "1")?.version).toBe(1);
    expect(selectGiveawayRulesVersion(VERSIONS, 2)?.version).toBe(2);
  });

  // Undefined rather than falling back to the current one: a link to a version
  // that does not exist is a 404, not a quiet redirect to different terms.
  test("a version that does not exist is not quietly replaced", () => {
    expect(selectGiveawayRulesVersion(VERSIONS, "9")).toBeUndefined();
    expect(selectGiveawayRulesVersion(VERSIONS, "latest")).toBeUndefined();
    expect(selectGiveawayRulesVersion(VERSIONS, "1.5")).toBeUndefined();
  });

  test("a promotion with nothing published serves nothing", () => {
    expect(selectGiveawayRulesVersion([])).toBeUndefined();
    expect(selectGiveawayRulesVersion([], "1")).toBeUndefined();
  });
});
