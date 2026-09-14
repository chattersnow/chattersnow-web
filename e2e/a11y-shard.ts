// Splitting the a11y scan across CI runners (issue #844).
//
// The scan outgrew one runner. At 129 routes it takes ~900s -- CI's critical
// path at ~19 min against 4-7 min for every other job -- and it grows with
// every page.tsx added to src/app. A11Y_WORKERS, which splits the routes across
// browser contexts inside one process (#751), is not the lever any more: six
// workers scanned 860s against four workers' 844s on the same commit, so a
// 4-vCPU runner is already saturated. What is left to divide is machines.
//
// So the CI job runs as a matrix and each runner scans every Nth route. The
// pieces live here rather than in a11y-scan.ts because a11y-scan.ts launches
// Chromium at import time, which makes the arithmetic below untestable from a
// unit test -- and "the N shards are disjoint and cover the list exactly" is
// precisely the property that has to hold for the baseline check to stay
// honest. See test/a11y-shard.test.ts.

export type ShardSelection = {
  /** 1-based position of this runner. */
  index: number;
  /** How many runners are splitting the work; 1 means an unsharded run. */
  total: number;
};

export const UNSHARDED: ShardSelection = { index: 1, total: 1 };

/**
 * Reads `A11Y_SHARD` in the form `i/N`.
 *
 * Defaults to 1/1 when unset or empty, so `bun run test:a11y` on a laptop --
 * and any other caller that does not know this exists -- scans the whole app
 * exactly as it did before.
 */
export function parseShard(raw: string | undefined): ShardSelection {
  const value = (raw ?? "").trim();
  if (value === "") return UNSHARDED;

  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (!match) {
    throw new Error(
      `A11Y_SHARD must look like "i/N" (for example "2/4"), got "${value}".`,
    );
  }
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (total < 1) {
    throw new Error(`A11Y_SHARD needs at least 1 shard, got "${value}".`);
  }
  if (index < 1 || index > total) {
    throw new Error(
      `A11Y_SHARD index must be between 1 and ${total}, got "${value}".`,
    );
  }
  return { index, total };
}

/**
 * This runner's share of a list.
 *
 * Round-robin rather than contiguous, for the same reason the in-process split
 * is: route cost varies by an order of magnitude between a static public page
 * and a portal list page with a dozen surfaces, and the expensive ones cluster
 * by path, so contiguous slices would hand one runner an entire heavy section
 * and leave another with the marketing site. Taking every Nth item interleaves
 * them.
 *
 * The slices are disjoint and their union is the input, in order -- which is
 * what lets each shard run `--check` against the full baseline with no merge
 * step: `--check` only reports a baselined violation as fixed for keys the run
 * actually scanned (#751), so a shard fails on its own regressions and stays
 * silent about routes it never visited.
 *
 * With total === 1 the input is returned untouched.
 */
export function sliceForShard<T>(items: T[], shard: ShardSelection): T[] {
  if (shard.total === 1) return items;
  return items.filter((_, i) => i % shard.total === shard.index - 1);
}

/**
 * Why `--update-baseline` must not run under this shard, or null if it may.
 *
 * A sharded run sees a fraction of the routes, and the baseline is written
 * whole -- so writing it from one shard would silently drop every key the
 * other shards own, and `--check` would then pass against a baseline that has
 * forgotten most of the app. `bun run a11y:baseline` is a local, unsharded job
 * by construction; this makes that a rule rather than a habit.
 */
export function baselineUpdateBlockedReason(
  shard: ShardSelection,
): string | null {
  if (shard.total === 1) return null;
  return (
    `--update-baseline scans every route by definition, but A11Y_SHARD is ` +
    `"${shard.index}/${shard.total}", which scans a fraction of them. ` +
    `Writing the baseline from a shard would drop every route the other ` +
    `shards own. Run \`bun run a11y:baseline\` with A11Y_SHARD unset.`
  );
}
