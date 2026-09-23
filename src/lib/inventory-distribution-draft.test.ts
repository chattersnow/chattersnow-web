import { describe, expect, test } from "bun:test";
import {
  distributionDraftHref,
  scanWarning,
} from "./inventory-distribution-draft";

describe("scanWarning", () => {
  const gear = { intendedUse: "gear_library" };

  test("available and reserved gear-library items can go out", () => {
    expect(scanWarning({ ...gear, status: "available" })).toBeNull();
    // Fulfilling a gear request is a distribution of a reserved item.
    expect(scanWarning({ ...gear, status: "reserved" })).toBeNull();
  });

  test("an item that cannot go out says why", () => {
    expect(scanWarning({ ...gear, status: "distributed" })).toBe(
      "Already distributed.",
    );
    expect(scanWarning({ ...gear, status: "retired" })).toBe("Retired.");
    expect(scanWarning({ ...gear, status: "damaged" })).toBe(
      "Not available (damaged).",
    );
  });

  test("giveaway prizes and internal-use items are not handed out", () => {
    expect(
      scanWarning({ status: "available", intendedUse: "giveaway" }),
    ).toMatch(/not gear-library/i);
  });
});

describe("distributionDraftHref", () => {
  test("an event's list is on its Distributions section", () => {
    expect(distributionDraftHref("abc")).toBe(
      "/portal/events/abc?tab=distributions",
    );
  });

  test("a list with no event is on Inventory > Distribution", () => {
    expect(distributionDraftHref(null)).toBe("/portal/inventory/distribution");
  });
});
