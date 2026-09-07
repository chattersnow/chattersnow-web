import { describe, expect, test } from "bun:test";
import {
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
  formatCountdown,
  idlePhaseAt,
  msUntilNextIdleTransition,
  parseActivityStamp,
} from "./idle-timeout";

const durations = { idleMs: 30 * 60_000, warningMs: 2 * 60_000 };
const START = 1_700_000_000_000;
const at = (minutes: number) => START + minutes * 60_000;

describe("idlePhaseAt", () => {
  test("stays active right up to the warning", () => {
    expect(idlePhaseAt(START, at(27.9), durations)).toBe("active");
  });

  test("warns exactly on the boundary", () => {
    expect(idlePhaseAt(START, at(28), durations)).toBe("warning");
  });

  test("expires exactly on the timeout", () => {
    expect(idlePhaseAt(START, at(30), durations)).toBe("expired");
  });

  test("is still expired long afterwards", () => {
    expect(idlePhaseAt(START, at(600), durations)).toBe("expired");
  });

  test("treats a future stamp as active rather than expired", () => {
    // A stamp written by a tab whose clock runs fast. Reading it as an expiry
    // would sign someone out mid-sentence.
    expect(idlePhaseAt(at(5), START, durations)).toBe("active");
  });
});

describe("msUntilNextIdleTransition", () => {
  test("counts down to the warning while active", () => {
    expect(msUntilNextIdleTransition(START, START, durations)).toBe(
      28 * 60_000,
    );
  });

  test("counts down to expiry once warning", () => {
    expect(msUntilNextIdleTransition(START, at(29), durations)).toBe(60_000);
  });

  test("is zero once expired, never negative", () => {
    expect(msUntilNextIdleTransition(START, at(45), durations)).toBe(0);
  });
});

describe("formatCountdown", () => {
  test.each([
    [120_000, "2:00"],
    [119_000, "1:59"],
    [60_000, "1:00"],
    // Rounds up, so the dialog never sits on 0:00 looking hung.
    [5_400, "0:06"],
    [1, "0:01"],
    [0, "0:00"],
    [-500, "0:00"],
  ])("formats %p as %p", (ms, expected) => {
    expect(formatCountdown(ms)).toBe(expected);
  });
});

describe("parseActivityStamp", () => {
  test("reads a real stamp", () => {
    expect(parseActivityStamp(String(START))).toBe(START);
  });

  test.each([[null], [""], ["   "], ["banana"], ["NaN"], ["0"], ["-5"]])(
    "rejects %p",
    (raw) => {
      // Anything that slips through here becomes either a 1970 stamp (instant
      // sign-out of every tab) or a NaN delay, which turns setTimeout into a
      // next-tick spin loop.
      expect(parseActivityStamp(raw)).toBeNull();
    },
  );
});

test("the warning fits inside the timeout", () => {
  expect(IDLE_WARNING_MS).toBeLessThan(IDLE_TIMEOUT_MS);
  expect(IDLE_TIMEOUT_MS).toBe(30 * 60_000);
  expect(IDLE_WARNING_MS).toBe(2 * 60_000);
});
