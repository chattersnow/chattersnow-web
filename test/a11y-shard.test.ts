import { describe, expect, test } from "bun:test";
import {
  baselineUpdateBlockedReason,
  parseShard,
  sliceForShard,
  UNSHARDED,
} from "../e2e/a11y-shard";

// The a11y scan runs on four CI runners (#844), and each one checks its own
// routes against the shared baseline with no merge step. That is only sound if
// the slices are disjoint and cover the route list exactly: a route in two
// shards is scanned twice, and a route in none is a regression nobody catches.
// The scan itself can't assert this -- it only ever sees its own slice -- and
// it launches Chromium against a live server, so the property is checked here
// instead, where it costs milliseconds.

const routes = Array.from({ length: 129 }, (_, i) => `/route-${i}`);

describe("parseShard", () => {
  test("defaults to the whole run when A11Y_SHARD is unset or empty", () => {
    expect(parseShard(undefined)).toEqual(UNSHARDED);
    expect(parseShard("")).toEqual(UNSHARDED);
    expect(parseShard("   ")).toEqual(UNSHARDED);
  });

  test("reads i/N", () => {
    expect(parseShard("1/1")).toEqual({ index: 1, total: 1 });
    expect(parseShard("3/4")).toEqual({ index: 3, total: 4 });
    expect(parseShard(" 2/4 ")).toEqual({ index: 2, total: 4 });
  });

  // A typo here would otherwise scan nothing and pass, which is the one
  // failure mode a green check can't distinguish from a healthy app.
  test.each(["4", "0/4", "5/4", "-1/4", "1/0", "2 of 4", "1/4/4", "a/b"])(
    "rejects %p",
    (raw) => {
      expect(() => parseShard(raw)).toThrow(/A11Y_SHARD/);
    },
  );
});

describe("sliceForShard", () => {
  test("returns the list untouched when unsharded", () => {
    expect(sliceForShard(routes, UNSHARDED)).toEqual(routes);
  });

  test.each([2, 3, 4, 5])(
    "the %i shards are disjoint and cover every route exactly once",
    (total) => {
      const slices = Array.from({ length: total }, (_, i) =>
        sliceForShard(routes, { index: i + 1, total }),
      );

      const union = slices.flat();
      expect(union.length).toBe(routes.length);
      expect(new Set(union).size).toBe(routes.length);
      expect([...union].sort()).toEqual([...routes].sort());
    },
  );

  test("splits the work evenly, to within one route", () => {
    const sizes = Array.from(
      { length: 4 },
      (_, i) => sliceForShard(routes, { index: i + 1, total: 4 }).length,
    );
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  // Round-robin rather than contiguous: heavy routes cluster by path, so
  // contiguous slices would hand one runner an entire portal section.
  test("interleaves rather than taking a contiguous block", () => {
    expect(
      sliceForShard(["a", "b", "c", "d", "e"], { index: 1, total: 2 }),
    ).toEqual(["a", "c", "e"]);
    expect(
      sliceForShard(["a", "b", "c", "d", "e"], { index: 2, total: 2 }),
    ).toEqual(["b", "d"]);
  });

  test("a shard with fewer items than runners is empty, not undefined", () => {
    expect(sliceForShard(["only"], { index: 2, total: 4 })).toEqual([]);
  });
});

describe("baselineUpdateBlockedReason", () => {
  test("allows --update-baseline on an unsharded run", () => {
    expect(baselineUpdateBlockedReason(UNSHARDED)).toBeNull();
  });

  // Writing the baseline from a shard would drop every key the other shards
  // own, and the next --check would pass against a baseline that has forgotten
  // most of the app.
  test("blocks --update-baseline on a shard, and says what to run instead", () => {
    const reason = baselineUpdateBlockedReason({ index: 2, total: 4 });
    expect(reason).toContain("2/4");
    expect(reason).toContain("a11y:baseline");
  });
});
