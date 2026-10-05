import { describe, expect, test } from "bun:test";
import type { DistributionDraft } from "@/lib/inventory-distribution-draft";
import {
  checkoutReady,
  EMPTY_CHECKOUT,
  tagsToRemove,
} from "./distribution-checkout";

function draft(
  numberedCodes: (string | null)[],
  acknowledged = false,
): DistributionDraft {
  return {
    eventId: null,
    eventName: null,
    recipient: null,
    updatedAt: "2026-10-05T12:00:00Z",
    acknowledgement: acknowledged
      ? {
          acknowledgedAt: "2026-10-05T12:00:00Z",
          typedName: "Robin Example",
          method: "own_device",
        }
      : null,
    items: numberedCodes.map((code, index) => ({
      id: `item-${index}`,
      description: `Item ${index}`,
      size: null,
      status: "available",
      intendedUse: "gear_library",
      heldBy: null,
      numberedCode: code,
    })),
  };
}

describe("tagsToRemove", () => {
  test("one line per numbered code, none for random or no code", () => {
    expect(
      tagsToRemove(draft(["CSN-007", null, "CSN-012"]), true).map(
        (tag) => tag.code,
      ),
    ).toEqual(["CSN-007", "CSN-012"]);
  });

  test("nothing comes off when the items are not marked distributed", () => {
    expect(tagsToRemove(draft(["CSN-007"]), false)).toEqual([]);
  });
});

describe("checkoutReady", () => {
  test("waits for every tag to be ticked", () => {
    const handout = draft(["CSN-007", "CSN-012"], true);
    expect(
      checkoutReady(handout, true, true, {
        ...EMPTY_CHECKOUT,
        removedTags: ["CSN-007"],
      }),
    ).toBe(false);
    expect(
      checkoutReady(handout, true, true, {
        ...EMPTY_CHECKOUT,
        removedTags: ["CSN-007", "CSN-012"],
      }),
    ).toBe(true);
  });

  test("waits for the acknowledgement, or a reason", () => {
    const handout = draft([null]);
    expect(checkoutReady(handout, true, true, EMPTY_CHECKOUT)).toBe(false);
    expect(
      checkoutReady(handout, true, true, {
        ...EMPTY_CHECKOUT,
        skippedReason: "no_phone",
      }),
    ).toBe(true);
    expect(checkoutReady(draft([null], true), true, true, EMPTY_CHECKOUT)).toBe(
      true,
    );
  });

  test("'other' needs a note", () => {
    const handout = draft([null]);
    const other = { ...EMPTY_CHECKOUT, skippedReason: "other" as const };
    expect(checkoutReady(handout, true, true, other)).toBe(false);
    expect(
      checkoutReady(handout, true, true, { ...other, skippedNote: "Parent" }),
    ).toBe(true);
  });

  test("a handout covered by acknowledged requests needs nothing more", () => {
    expect(checkoutReady(draft([null]), true, false, EMPTY_CHECKOUT)).toBe(
      true,
    );
  });
});
