import { describe, expect, test } from "bun:test";
import {
  itemCount,
  nextSuggestion,
  planBulkAssign,
  skipReasonText,
  type BulkAssignItem,
} from "./bulk-assign";

function item(
  id: string,
  overrides: Partial<BulkAssignItem> = {},
): BulkAssignItem {
  return {
    id,
    description: `Item ${id}`,
    status: "available",
    assetTag: `TAG-${id}`,
    numberedCode: null,
    ...overrides,
  };
}

describe("planBulkAssign", () => {
  test("walks in-stock items without a numbered code, in selection order", () => {
    const plan = planBulkAssign([
      item("a"),
      item("b", { status: "reserved" }),
      item("c", { assetTag: null }),
    ]);
    expect(plan.queue.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(plan.skipped).toEqual([]);
  });

  test("passes over an item with a numbered code or one that has left", () => {
    const plan = planBulkAssign([
      item("a", { numberedCode: "CSN-007" }),
      item("b", { status: "distributed" }),
      item("c", { status: "lost", numberedCode: null }),
      item("d"),
    ]);
    expect(plan.queue.map((entry) => entry.id)).toEqual(["d"]);
    expect(plan.skipped).toEqual([
      {
        id: "a",
        description: "Item a",
        reason: "has_numbered",
        code: "CSN-007",
      },
      { id: "b", description: "Item b", reason: "left_inventory" },
      { id: "c", description: "Item c", reason: "left_inventory" },
    ]);
  });
});

describe("skipReasonText", () => {
  const base = { id: "a", description: "Item a" };

  test("names the code and its holder for a taken code", () => {
    expect(
      skipReasonText({
        ...base,
        reason: "code_taken",
        code: "CSN-007",
        holder: "Blue jacket",
      }),
    ).toBe("CSN-007 is on Blue jacket.");
  });

  test("says why for every other reason", () => {
    expect(
      skipReasonText({ ...base, reason: "has_numbered", code: "CSN-001" }),
    ).toBe("Already has CSN-001.");
    expect(skipReasonText({ ...base, reason: "left_inventory" })).toBe(
      "Has left inventory.",
    );
    expect(skipReasonText({ ...base, reason: "by_hand" })).toBe("Skipped.");
    expect(skipReasonText({ ...base, reason: "not_reached" })).toBe(
      "Not reached: stopped before it.",
    );
  });
});

describe("nextSuggestion", () => {
  test("skips codes already bound in this run", () => {
    expect(nextSuggestion(["CSN-001", "CSN-002"], ["CSN-001"])).toBe("CSN-002");
  });

  test("is null once the free codes run out", () => {
    expect(nextSuggestion(["CSN-001"], ["CSN-001"])).toBeNull();
    expect(nextSuggestion([], [])).toBeNull();
  });
});

test("itemCount", () => {
  expect(itemCount(1)).toBe("1 item");
  expect(itemCount(0)).toBe("0 items");
  expect(itemCount(3)).toBe("3 items");
});
