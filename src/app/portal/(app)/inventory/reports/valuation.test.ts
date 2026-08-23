import { describe, expect, test } from "bun:test";
import { summarizeByStatus, summarizeByType, sumMovementValue, toNumber } from "./valuation";

describe("toNumber", () => {
  test("coerces numeric strings", () => {
    expect(toNumber("42.5")).toBe(42.5);
  });

  test("returns 0 for null", () => {
    expect(toNumber(null)).toBe(0);
  });

  test("returns 0 for non-numeric strings", () => {
    expect(toNumber("abc")).toBe(0);
  });
});

describe("summarizeByType", () => {
  const items = [
    { type: "jacket", status: "available", face_value: 40 },
    { type: "jacket", status: "available", face_value: "60" },
    { type: "boots", status: "available", face_value: 25 },
    { type: "jacket", status: "distributed", face_value: 100 },
    { type: null, status: "available", face_value: 10 },
    { type: "  ", status: "available", face_value: 5 },
  ];

  test("only includes items matching the given status, summed and counted per type", () => {
    expect(summarizeByType(items, "available")).toEqual([
      { type: "jacket", count: 2, totalValue: 100 },
      { type: "boots", count: 1, totalValue: 25 },
      { type: "Unspecified", count: 2, totalValue: 15 },
    ]);
  });

  test("sorts by total value descending", () => {
    const result = summarizeByType(items, "available");
    expect(result.map((row) => row.type)).toEqual(["jacket", "boots", "Unspecified"]);
  });

  test("defaults to available status", () => {
    expect(summarizeByType(items)).toEqual(summarizeByType(items, "available"));
  });
});

describe("summarizeByStatus", () => {
  const statuses = ["available", "distributed", "lost"];
  const items = [
    { type: "jacket", status: "available", face_value: 40 },
    { type: "boots", status: "distributed", face_value: 25 },
    { type: "boots", status: "distributed", face_value: 25 },
  ];

  test("zero-fills statuses with no items", () => {
    expect(summarizeByStatus(items, statuses)).toEqual([
      { status: "available", count: 1, totalValue: 40 },
      { status: "distributed", count: 2, totalValue: 50 },
      { status: "lost", count: 0, totalValue: 0 },
    ]);
  });

  test("preserves the given status order", () => {
    const result = summarizeByStatus(items, statuses);
    expect(result.map((row) => row.status)).toEqual(statuses);
  });
});

describe("sumMovementValue", () => {
  const movements = [
    { movement_type: "received", quantity: 1, inventory_items: { face_value: 50 } },
    { movement_type: "received", quantity: 2, inventory_items: { face_value: "30" } },
    { movement_type: "distributed", quantity: 1, inventory_items: { face_value: 20 } },
    { movement_type: "received", quantity: 1, inventory_items: null },
  ];

  test("sums face_value * quantity for matching movement types", () => {
    expect(sumMovementValue(movements, "received")).toBe(110);
  });

  test("treats a missing embedded item as zero value", () => {
    expect(sumMovementValue(movements, "received")).not.toBeNaN();
  });

  test("returns 0 when no movements match", () => {
    expect(sumMovementValue(movements, "lost")).toBe(0);
  });
});
