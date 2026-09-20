import { describe, expect, test } from "bun:test";
import {
  DELIVERY_PENDING_STUCK_MS,
  DELIVERY_SKIP_REASONS,
  deliverySkipReasonLabel,
  formatDeliveryAge,
  isDeliveryStuck,
} from "./delivery-record";

const NOW = new Date("2026-09-19T12:00:00.000Z");

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

describe("isDeliveryStuck", () => {
  // The delivery log's reason for existing is that an unfinished row looks
  // exactly like a fresh one. A claim, a send and a finalize are one request,
  // so anything still pending an hour later is a crash between two writes.
  test("a pending row younger than the threshold is in flight, not stuck", () => {
    expect(isDeliveryStuck("pending", minutesAgo(5), NOW)).toBe(false);
    expect(isDeliveryStuck("pending", minutesAgo(59), NOW)).toBe(false);
  });

  test("a pending row past the threshold is stuck", () => {
    expect(isDeliveryStuck("pending", minutesAgo(60), NOW)).toBe(true);
    expect(isDeliveryStuck("pending", minutesAgo(60 * 24 * 7), NOW)).toBe(true);
  });

  test("a finished row is never stuck, however old", () => {
    for (const status of ["sent", "failed", "skipped"]) {
      expect(isDeliveryStuck(status, minutesAgo(60 * 24 * 30), NOW)).toBe(
        false,
      );
    }
  });

  test("survives a missing or unparseable timestamp", () => {
    expect(isDeliveryStuck("pending", null, NOW)).toBe(false);
    expect(isDeliveryStuck("pending", "not a date", NOW)).toBe(false);
  });

  test("the threshold is an hour", () => {
    expect(DELIVERY_PENDING_STUCK_MS).toBe(60 * 60 * 1000);
  });
});

describe("deliverySkipReasonLabel", () => {
  test("explains every reason the column's check constraint accepts", () => {
    for (const reason of DELIVERY_SKIP_REASONS) {
      const label = deliverySkipReasonLabel(reason);
      expect({ reason, label }).toEqual({ reason, label: expect.any(String) });
      expect(label).not.toContain("_");
    }
  });

  test("has nothing to say about a row that was not skipped", () => {
    expect(deliverySkipReasonLabel(null)).toBeNull();
  });

  // A deployment where the database is ahead of the bundle. Showing the raw
  // value beats blanking the one cell the reader opened the row for.
  test("falls back to the stored value for a reason it has no copy for", () => {
    expect(deliverySkipReasonLabel("quarantined")).toBe("quarantined");
  });
});

describe("formatDeliveryAge", () => {
  test("uses the coarsest unit that still says something", () => {
    expect(formatDeliveryAge(minutesAgo(1), NOW)).toBe("1 minute");
    expect(formatDeliveryAge(minutesAgo(45), NOW)).toBe("45 minutes");
    expect(formatDeliveryAge(minutesAgo(60), NOW)).toBe("1 hour");
    expect(formatDeliveryAge(minutesAgo(60 * 47), NOW)).toBe("47 hours");
    expect(formatDeliveryAge(minutesAgo(60 * 48), NOW)).toBe("2 days");
    expect(formatDeliveryAge(minutesAgo(60 * 24 * 30), NOW)).toBe("30 days");
  });

  // Clock skew between the database and the renderer, which must not produce
  // "-1 minutes".
  test("never reports a negative age", () => {
    expect(formatDeliveryAge(minutesAgo(-5), NOW)).toBe("0 minutes");
  });

  test("says so plainly when the timestamp cannot be read", () => {
    expect(formatDeliveryAge("not a date", NOW)).toBe("an unknown time");
  });
});
