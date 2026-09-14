// #1082 Phase 1 acceptance criterion, as a test rather than a convention:
// "a `use server` wrapper that is the only thing importing next/cache".
//
// The cores are already proven loadable outside Next by the mere fact that
// their unit tests import them under `bun test`, where no Next runtime exists.
// What that does not catch is a core growing a `revalidatePath` later --
// which would still load, still pass, and quietly re-couple the write path to
// one framework. So this walks each core's transitive local imports and fails
// if any of them reaches next/cache.
//
// Only next/cache is asserted on, deliberately. `@/lib/auth/permissions`
// imports `redirect` from next/navigation for the page-level guards that
// share the module, and that import is inert outside Next (verified in the
// Phase 0 spike: the module imports and runs fine in a plain Bun process).
// Broadening this to all of `next/*` would fail on that without describing a
// real coupling.
import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

const CORES = [
  "src/app/portal/(app)/home/donation-core.ts",
  "src/app/portal/(app)/home/distribution-core.ts",
  "src/app/portal/(app)/events/registrant-core.ts",
];

const WRAPPERS = [
  "src/app/portal/(app)/home/actions.ts",
  "src/app/portal/(app)/home/distribution-actions.ts",
  "src/app/portal/(app)/events/registrants-actions.ts",
];

const IMPORT_PATTERN = /(?:from|import)\s*["']([^"']+)["']/g;

function importsOf(file: string): string[] {
  const source = readFileSync(join(ROOT, file), "utf8");
  return [...source.matchAll(IMPORT_PATTERN)].map((match) => match[1]);
}

/** Resolve a local specifier to a repo-relative .ts/.tsx file, or null. */
function resolveLocal(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = join("src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = join(dirname(fromFile), specifier);
  } else {
    return null; // a package, not ours
  }

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    base,
  ]) {
    const full = join(ROOT, candidate);
    if (existsSync(full) && statSync(full).isFile()) return candidate;
  }
  return null;
}

/** Every local module reachable from `entry`, plus the bare specifiers seen. */
function transitiveImports(entry: string) {
  const seen = new Set<string>();
  const packages = new Map<string, string>(); // specifier -> importer
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    for (const specifier of importsOf(file)) {
      const local = resolveLocal(file, specifier);
      if (local) {
        queue.push(local);
      } else {
        if (!packages.has(specifier)) packages.set(specifier, file);
      }
    }
  }

  return { files: seen, packages };
}

describe("the Next-free action cores (#1082 Phase 1)", () => {
  for (const core of CORES) {
    test(`${core} reaches next/cache from nothing it imports`, () => {
      const { packages } = transitiveImports(core);
      const offenders = [...packages.entries()].filter(([specifier]) =>
        specifier.startsWith("next/cache"),
      );
      expect(offenders).toEqual([]);
    });
  }

  for (const wrapper of WRAPPERS) {
    test(`${wrapper} is a "use server" module that owns the revalidation`, () => {
      const source = readFileSync(join(ROOT, wrapper), "utf8");
      expect(source.startsWith('"use server"')).toBe(true);
      expect(source).toContain('from "next/cache"');
      expect(source).toContain("revalidatePath(");
    });
  }
});
