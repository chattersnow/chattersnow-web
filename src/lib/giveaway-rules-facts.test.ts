import { describe, expect, test } from "bun:test";
import {
  describeBundle,
  oddsRows,
  resolveOverrides,
} from "@/lib/giveaway-rules-facts";

const TIERS = [
  { id: "gold", label: "Gold" },
  { id: "silver", label: "Silver" },
  { id: "bronze", label: "Bronze" },
];

const BUCKETS = [
  { id: "b1", name: "Gold bucket", tierId: "gold" },
  { id: "b2", name: "Silver bucket", tierId: "silver" },
  { id: "b3", name: "Second silver bucket", tierId: "silver" },
];

const TOTALS = [
  { tierId: "gold", tierLabel: "Gold", tickets: 48 },
  { tierId: "silver", tierLabel: "Silver", tickets: 60 },
];

describe("describing a bundle", () => {
  test("reads as a sentence", () => {
    expect(
      describeBundle(
        [
          { ticketTierId: "gold", quantity: 3 },
          { ticketTierId: "silver", quantity: 1 },
          { ticketTierId: "bronze", quantity: 1 },
        ],
        TIERS,
      ),
    ).toBe("3 gold, 1 silver and 1 bronze tickets");
  });

  // The default matrix has bronze earning no gold tickets at all, and "0 gold"
  // in a published set of rules reads as a mistake rather than as a fact.
  test("drops the colours a tier earns none of", () => {
    expect(
      describeBundle(
        [
          { ticketTierId: "gold", quantity: 0 },
          { ticketTierId: "bronze", quantity: 3 },
        ],
        TIERS,
      ),
    ).toBe("3 bronze tickets");
  });

  test("a package multiplies its tier's row", () => {
    expect(
      describeBundle([{ ticketTierId: "gold", quantity: 3 }], TIERS, 2),
    ).toBe("6 gold tickets");
  });

  test("one ticket is singular", () => {
    expect(
      describeBundle([{ ticketTierId: "silver", quantity: 1 }], TIERS),
    ).toBe("1 silver ticket");
  });

  test("a tier that earns nothing describes nothing", () => {
    expect(describeBundle([], TIERS)).toBeNull();
    expect(
      describeBundle([{ ticketTierId: "gold", quantity: 0 }], TIERS),
    ).toBeNull();
  });
});

describe("odds rows", () => {
  const prizes = [
    { bucketId: "b1" },
    { bucketId: "b2" },
    { bucketId: "b3" },
    { bucketId: null },
  ];

  test("overall counts every ticket against every prize", () => {
    expect(
      oddsRows("overall", { totals: TOTALS, buckets: BUCKETS, prizes }),
    ).toEqual([
      {
        label: "Every ticket in this promotion",
        tickets: 108,
        prizes: 4,
        ticketsAreUpperBound: false,
      },
    ]);
  });

  // A colour's tickets are all in that colour's buckets, so this one is exact:
  // silver's 60 tickets against the two silver buckets' two prizes.
  test("per colour counts the prizes in that colour's buckets", () => {
    const rows = oddsRows("colour", {
      totals: TOTALS,
      buckets: BUCKETS,
      prizes,
    });
    expect(rows).toEqual([
      {
        label: "Gold tickets",
        tickets: 48,
        prizes: 1,
        ticketsAreUpperBound: false,
      },
      {
        label: "Silver tickets",
        tickets: 60,
        prizes: 2,
        ticketsAreUpperBound: false,
      },
    ]);
  });

  // Which of silver's two buckets a silver ticket went into is not recorded
  // anywhere, so each of them is published against the whole colour -- the
  // worst case -- and marked as a bound rather than a count.
  test("per bucket counts every ticket of the colour, as an upper bound", () => {
    const rows = oddsRows("bucket", {
      totals: TOTALS,
      buckets: BUCKETS,
      prizes,
    });
    expect(rows).toEqual([
      {
        label: "Gold bucket",
        tickets: 48,
        prizes: 1,
        ticketsAreUpperBound: true,
      },
      {
        label: "Silver bucket",
        tickets: 60,
        prizes: 1,
        ticketsAreUpperBound: true,
      },
      {
        label: "Second silver bucket",
        tickets: 60,
        prizes: 1,
        ticketsAreUpperBound: true,
      },
    ]);
  });

  test("a bucket of a colour nobody earned counts nothing", () => {
    const rows = oddsRows("bucket", {
      totals: [],
      buckets: BUCKETS,
      prizes,
    });
    expect(rows.every((row) => row.tickets === 0)).toBe(true);
  });
});

describe("stored overrides", () => {
  test("keeps paragraphs and trims them", () => {
    expect(resolveOverrides({ odds: ["  one  ", "two"] })).toEqual({
      odds: ["one", "two"],
    });
  });

  test("an empty or non-array override is not an override", () => {
    expect(
      resolveOverrides({ odds: [], prizes: "text", sponsor: null }),
    ).toEqual({});
  });

  test("anything that is not an object is no overrides at all", () => {
    expect(resolveOverrides(null)).toEqual({});
    expect(resolveOverrides(["odds"])).toEqual({});
    expect(resolveOverrides("odds")).toEqual({});
  });
});
