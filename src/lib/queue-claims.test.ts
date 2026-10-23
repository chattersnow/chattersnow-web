import { describe, expect, test } from "bun:test";
import {
  QUEUE_KEYS,
  RESOLVED_STATUSES,
  applyClaimFilter,
  claimClearFor,
  claimFilterValue,
  matchesClaimFilter,
  parseClaimFilter,
  withUnclaimedFilter,
  withUnclaimedSuffix,
} from "./queue-claims";

const PERSON = "6f1c2a4e-3b5d-4c7e-9f00-1a2b3c4d5e6f";

describe("parseClaimFilter", () => {
  test("reads none, mine and a person id", () => {
    expect(parseClaimFilter("none")).toEqual({ kind: "none" });
    expect(parseClaimFilter("mine")).toEqual({ kind: "mine" });
    expect(parseClaimFilter(PERSON.toUpperCase())).toEqual({
      kind: "person",
      personId: PERSON,
    });
  });

  test("anything else is no filter", () => {
    expect(parseClaimFilter(undefined)).toEqual({ kind: "all" });
    expect(parseClaimFilter("all")).toEqual({ kind: "all" });
    expect(parseClaimFilter("someone")).toEqual({ kind: "all" });
    expect(parseClaimFilter(["none", "mine"])).toEqual({ kind: "none" });
  });

  test("round-trips through claimFilterValue", () => {
    for (const raw of ["all", "none", "mine", PERSON]) {
      expect(claimFilterValue(parseClaimFilter(raw))).toBe(raw);
    }
  });
});

describe("applyClaimFilter", () => {
  function recorder() {
    const calls: [string, string, unknown][] = [];
    const query = {
      is(column: string, value: null) {
        calls.push(["is", column, value]);
        return query;
      },
      eq(column: string, value: string) {
        calls.push(["eq", column, value]);
        return query;
      },
    };
    return { query, calls };
  }

  test("All adds nothing", () => {
    const { query, calls } = recorder();
    applyClaimFilter(query, { kind: "all" }, PERSON);
    expect(calls).toEqual([]);
  });

  test("Unclaimed filters on a null claimant", () => {
    const { query, calls } = recorder();
    applyClaimFilter(query, { kind: "none" }, PERSON);
    expect(calls).toEqual([["is", "claimed_by_person_id", null]]);
  });

  test("Mine filters on the caller's person", () => {
    const { query, calls } = recorder();
    applyClaimFilter(query, { kind: "mine" }, PERSON);
    expect(calls).toEqual([["eq", "claimed_by_person_id", PERSON]]);
  });

  test("Mine with no person record matches nothing rather than everything", () => {
    const { query, calls } = recorder();
    applyClaimFilter(query, { kind: "mine" }, null);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("eq");
    expect(calls[0][2]).not.toBe(PERSON);
  });
});

describe("matchesClaimFilter", () => {
  const OTHER = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

  test("All keeps every row", () => {
    expect(matchesClaimFilter(null, { kind: "all" }, PERSON)).toBe(true);
    expect(matchesClaimFilter(OTHER, { kind: "all" }, PERSON)).toBe(true);
  });

  test("Unclaimed keeps only rows nobody has", () => {
    expect(matchesClaimFilter(null, { kind: "none" }, PERSON)).toBe(true);
    expect(matchesClaimFilter(OTHER, { kind: "none" }, PERSON)).toBe(false);
  });

  test("Mine and a person keep only that person's rows", () => {
    expect(matchesClaimFilter(PERSON, { kind: "mine" }, PERSON)).toBe(true);
    expect(matchesClaimFilter(OTHER, { kind: "mine" }, PERSON)).toBe(false);
    expect(matchesClaimFilter(null, { kind: "mine" }, null)).toBe(false);
    expect(
      matchesClaimFilter(OTHER, { kind: "person", personId: OTHER }, PERSON),
    ).toBe(true);
    expect(
      matchesClaimFilter(null, { kind: "person", personId: OTHER }, PERSON),
    ).toBe(false);
  });
});

describe("claimClearFor", () => {
  test("clears on every resolving status and keeps it otherwise", () => {
    expect(claimClearFor("contact_messages", "resolved")).toEqual({
      claimed_by_person_id: null,
      claimed_at: null,
    });
    expect(claimClearFor("contact_messages", "read")).toEqual({});
    expect(claimClearFor("volunteer_applications", "contacted")).toEqual({});
    expect(claimClearFor("volunteer_applications", "closed")).toEqual({
      claimed_by_person_id: null,
      claimed_at: null,
    });
  });

  test("every queue resolves somehow", () => {
    for (const queue of QUEUE_KEYS) {
      expect(RESOLVED_STATUSES[queue].length).toBeGreaterThan(0);
    }
  });
});

describe("inbox wording", () => {
  test("no suffix and no filter when every item is unclaimed", () => {
    expect(withUnclaimedSuffix("New item requests", 5, 5)).toBe(
      "New item requests",
    );
    expect(withUnclaimedFilter("/portal/x?status=new", 5, 5)).toBe(
      "/portal/x?status=new",
    );
  });

  test("a suffix and claimed=none when some are claimed", () => {
    expect(withUnclaimedSuffix("New item requests", 5, 2)).toBe(
      "New item requests (2 unclaimed)",
    );
    expect(withUnclaimedFilter("/portal/x?status=new", 5, 2)).toBe(
      "/portal/x?status=new&claimed=none",
    );
    expect(withUnclaimedFilter("/portal/people/claims", 3, 0)).toBe(
      "/portal/people/claims?claimed=none",
    );
  });
});
