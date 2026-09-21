// The written instruction in `docs/permissions.md` -- "a change to a
// permission check updates permission-docs.ts in the same pull request" -- is
// a suggestion without this (#1324).
//
// Like nav-guards.test.ts and module-catalog.test.ts, this reads the source on
// disk rather than a constant. The facts it checks against are spread over
// three places by nature: the resource catalog is seeded in SQL, the checks
// that decide what a page allows are in ~170 call sites under src/, and the
// checks that decide what rows come back are in ~660 `has_permission()`
// references in the migrations. A constant listing them would be a fourth
// place to forget.
//
// No database needed: everything here is text on disk.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import {
  migrationFileNames,
  readMigration,
  seededResources,
} from "../../../test/migration-sql";
import { PERMISSION_DOCS, type PermissionDoc } from "./permission-docs";

const SRC = join(import.meta.dir, "../..");

const resources = seededResources();
const resourceKeys = new Set(resources.keys());

type Level = "view" | "manage";

/** Where one resource/level pair was found, for a message that names a file. */
type Check = { resource: string; level: Level; where: string };

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (![".ts", ".tsx"].includes(extname(entry.name))) continue;
    // A test's fixtures are not the product's checks: permission-matrix
    // integration tests name every resource at every level on purpose.
    if (/\.(test|dom\.test|integration\.test)\.tsx?$/.test(entry.name))
      continue;
    // This module *is* the catalog; its keys are not evidence of a check.
    if (entry.name === "permission-docs.ts") continue;
    out.push(path);
  }
  return out;
}

/**
 * Every resource/level pair the app code asks for.
 *
 * Matched by shape rather than by call name -- `requirePermission`,
 * `requireAnyPermission`, `hasPermission`, `checkPermission`,
 * `checkAnyPermission` and nav.ts's `access` arrays all reduce to a quoted key
 * beside a quoted level. Restricting the key to one the catalog actually holds
 * is what keeps an unrelated pair of string literals out.
 */
function checksInAppCode(): Check[] {
  const found: Check[] = [];
  const positional = /"([a-z0-9_]+)"\s*,\s*"(view|manage)"/g;
  const named = /resource:\s*"([a-z0-9_]+)"\s*,\s*level:\s*"(view|manage)"/g;

  for (const path of sourceFiles(SRC)) {
    const source = readFileSync(path, "utf8");
    const where = relative(join(SRC, ".."), path);
    for (const pattern of [positional, named]) {
      for (const match of source.matchAll(pattern)) {
        if (!resourceKeys.has(match[1])) continue;
        found.push({
          resource: match[1],
          level: match[2] as Level,
          where,
        });
      }
    }
  }
  return found;
}

/** Every resource/level pair a row-level policy or an RPC asks for. */
function checksInMigrations(): Check[] {
  const found: Check[] = [];
  for (const name of migrationFileNames()) {
    const sql = readMigration(name);
    for (const match of sql.matchAll(
      /has_permission\(\s*'([a-z0-9_]+)'\s*,\s*'(view|manage)'/g,
    )) {
      if (!resourceKeys.has(match[1])) continue;
      found.push({
        resource: match[1],
        level: match[2] as Level,
        where: `supabase/migrations/${name}`,
      });
    }
  }
  return found;
}

const checks = [...checksInAppCode(), ...checksInMigrations()];

/** resource -> the levels anything in the product actually asks for. */
const checkedLevels = new Map<string, Set<Level>>();
for (const check of checks) {
  const levels = checkedLevels.get(check.resource) ?? new Set<Level>();
  levels.add(check.level);
  checkedLevels.set(check.resource, levels);
}

function prose(doc: PermissionDoc, level: Level): string | null {
  return level === "view" ? doc.view : doc.manage;
}

describe("the permission catalog is documented", () => {
  // Without this the whole file could pass by finding nothing at all.
  test("the readers find the catalog and the checks", () => {
    expect(resourceKeys.size).toBeGreaterThan(30);
    expect(checksInAppCode().length).toBeGreaterThan(100);
    expect(checksInMigrations().length).toBeGreaterThan(400);
  });

  test("every resource a migration seeds has an entry", () => {
    const undocumented = [...resourceKeys]
      .filter((key) => !PERMISSION_DOCS[key])
      .map((key) => `${key} (seeded by ${resources.get(key)!.migration})`);

    expect(undocumented).toEqual([]);
  });

  test("every entry names a resource that exists", () => {
    const invented = Object.keys(PERMISSION_DOCS).filter(
      (key) => !resourceKeys.has(key),
    );

    expect(invented).toEqual([]);
  });

  test("every resource a check names has an entry", () => {
    const missing = new Map<string, string>();
    for (const check of checks) {
      if (PERMISSION_DOCS[check.resource]) continue;
      if (!missing.has(check.resource))
        missing.set(check.resource, check.where);
    }

    expect(
      [...missing].map(([resource, where]) => `${resource} (${where})`),
    ).toEqual([]);
  });
});

describe("the prose matches the checks on disk", () => {
  test("a level something asks for is a level the entry explains", () => {
    const gaps: string[] = [];
    for (const [resource, levels] of checkedLevels) {
      const doc = PERMISSION_DOCS[resource];
      if (!doc) continue; // reported by its own test above
      for (const level of levels) {
        if (prose(doc, level)) continue;
        const where = checks.find(
          (check) => check.resource === resource && check.level === level,
        )!.where;
        gaps.push(
          `${resource}:${level} is checked in ${where} but the entry documents it as having no effect`,
        );
      }
    }

    expect(gaps).toEqual([]);
  });

  // The other direction, which is the one that rots quietly: a check that is
  // deleted or tightened leaves prose promising something the product no
  // longer does, and nothing else in the repository would notice.
  test("a level the entry explains is a level something asks for", () => {
    const stale: string[] = [];
    for (const [resource, doc] of Object.entries(PERMISSION_DOCS)) {
      for (const level of ["view", "manage"] as const) {
        if (!prose(doc, level)) continue;
        if (checkedLevels.get(resource)?.has(level)) continue;
        stale.push(
          `${resource}:${level} is documented but nothing in src/ or supabase/migrations/ asks for it`,
        );
      }
    }

    expect(stale).toEqual([]);
  });

  test("an entry explains at least one level", () => {
    const empty = Object.entries(PERMISSION_DOCS)
      .filter(([, doc]) => !doc.view && !doc.manage)
      .map(([key]) => key);

    expect(empty).toEqual([]);
  });
});

describe("the cross-references point somewhere", () => {
  test("every 'does not include' names a real resource", () => {
    const dangling: string[] = [];
    for (const [resource, doc] of Object.entries(PERMISSION_DOCS)) {
      for (const exclusion of doc.excludes ?? []) {
        if (!resourceKeys.has(exclusion.key)) {
          dangling.push(`${resource} excludes unknown ${exclusion.key}`);
        }
        if (exclusion.key === resource) {
          dangling.push(`${resource} excludes itself`);
        }
      }
    }

    expect(dangling).toEqual([]);
  });

  test("no resource is excluded twice by the same entry", () => {
    const duplicated: string[] = [];
    for (const [resource, doc] of Object.entries(PERMISSION_DOCS)) {
      const seen = new Set<string>();
      for (const exclusion of doc.excludes ?? []) {
        if (seen.has(exclusion.key)) {
          duplicated.push(`${resource} excludes ${exclusion.key} twice`);
        }
        seen.add(exclusion.key);
      }
    }

    expect(duplicated).toEqual([]);
  });
});
