import { describe, expect, test } from "bun:test";
import { isMilestoneDueSoonOrOverdue } from "./nonprofit-status-badges";

const NOW = new Date("2026-08-30T15:00:00Z");

function milestone(
  due_date: string | null,
  status: "not_started" | "in_progress" | "done" | "cancelled" = "in_progress",
) {
  return { due_date, status };
}

describe("isMilestoneDueSoonOrOverdue", () => {
  test("false when there is no due date", () => {
    expect(isMilestoneDueSoonOrOverdue(milestone(null), NOW)).toBe(false);
  });

  test("false for a milestone marked done, even if overdue", () => {
    expect(
      isMilestoneDueSoonOrOverdue(milestone("2026-08-01", "done"), NOW),
    ).toBe(false);
  });

  test("false for a milestone marked cancelled, even if overdue", () => {
    expect(
      isMilestoneDueSoonOrOverdue(milestone("2026-08-01", "cancelled"), NOW),
    ).toBe(false);
  });

  test("true when the due date has already passed", () => {
    expect(isMilestoneDueSoonOrOverdue(milestone("2026-08-29"), NOW)).toBe(
      true,
    );
  });

  test("true when due today", () => {
    expect(isMilestoneDueSoonOrOverdue(milestone("2026-08-30"), NOW)).toBe(
      true,
    );
  });

  test("true when due within the 2-day threshold", () => {
    expect(isMilestoneDueSoonOrOverdue(milestone("2026-09-01"), NOW)).toBe(
      true,
    );
  });

  test("false when due beyond the 2-day threshold", () => {
    expect(isMilestoneDueSoonOrOverdue(milestone("2026-09-02"), NOW)).toBe(
      false,
    );
  });
});
