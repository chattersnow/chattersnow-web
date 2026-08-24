import { describe, expect, test } from "bun:test";
import { computeDiff } from "./diff";

describe("computeDiff", () => {
  test("marks only changed keys as changed", () => {
    const result = computeDiff(
      { status: "available", notes: "ok" },
      { status: "distributed", notes: "ok" },
    );
    const status = result.find((entry) => entry.key === "status");
    const notes = result.find((entry) => entry.key === "notes");
    expect(status?.changed).toBe(true);
    expect(status?.before).toBe("available");
    expect(status?.after).toBe("distributed");
    expect(notes?.changed).toBe(false);
  });

  test("treats keys only present on one side as changed", () => {
    const result = computeDiff(null, { amount: 10 });
    expect(result).toEqual([
      { key: "amount", before: null, after: 10, changed: true },
    ]);
  });

  test("returns entries sorted by key", () => {
    const result = computeDiff({ b: 1, a: 1 }, { b: 1, a: 1 });
    expect(result.map((entry) => entry.key)).toEqual(["a", "b"]);
  });

  test("handles both sides null", () => {
    expect(computeDiff(null, null)).toEqual([]);
  });
});
