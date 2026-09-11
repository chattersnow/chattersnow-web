// The module catalog (#900), checked against the resource catalog it partitions.
//
// Both live in SQL, so this reads the migrations rather than a TypeScript
// constant -- the same thing page-visibility.test.ts does when it checks that
// every registered slot has a gate on disk. The `not null` on
// `resources.module_key` already makes an unmapped resource impossible; what a
// constraint cannot give you is the message. "Resources with no module:
// artwork_submissions" tells whoever added a resource next month what to do,
// and it says it in `bun run test` rather than on the first `db:reset`.
//
// A resource's module comes from one of two places, and this reads both
// (#907). Everything that existed when modules landed is named in the backfill
// inside the entitlements migration. Everything added since carries
// `module_key` in its own `insert into public.resources` -- which is where it
// has to be, since the column is `not null` and that backfill is an `update`
// over rows that already existed: on a fresh database it runs before the later
// migration inserts the resource and matches nothing, and on a hosted one it
// has already run. Adding a row to it for a new resource would be a statement
// about the past that never executes.
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(import.meta.dir, "../../../supabase/migrations");
const ENTITLEMENTS = "20260910010000_tenant_module_entitlements.sql";

const migrationFiles = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql"))
  .sort();

/** The text of one `insert`/`update` statement, from its header to its `;`. */
function statementsAfter(sql: string, header: RegExp): string[] {
  const out: string[] = [];
  for (const match of sql.matchAll(header)) {
    const from = match.index + match[0].length;
    const to = sql.indexOf(";", from);
    out.push(sql.slice(from, to === -1 ? undefined : to));
  }
  return out;
}

/**
 * The `(...)` rows of a values list, split on parens that are not inside a
 * string literal.
 *
 * A regex cannot do this: a resource's `description` is prose, and prose
 * contains commas, brackets and doubled apostrophes. Scanning for the quote
 * state costs a dozen lines and is right for every row, including the next one
 * somebody writes.
 */
function valueRows(body: string): string[] {
  const rows: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;

  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (inString) {
      // '' is an escaped quote inside a literal, not the end of one.
      if (char === "'") {
        if (body[i + 1] === "'") i++;
        else inString = false;
      }
      continue;
    }
    if (char === "'") inString = true;
    else if (char === "(") {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (char === ")") {
      depth--;
      if (depth === 0) rows.push(body.slice(start, i));
    }
  }

  return rows;
}

/** One row's values, split on top-level commas, in column order. */
function valueFields(row: string): string[] {
  const fields: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (inString) {
      if (char === "'") {
        if (row[i + 1] === "'") i++;
        else inString = false;
      }
      continue;
    }
    if (char === "'") inString = true;
    else if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "," && depth === 0) {
      fields.push(row.slice(start, i));
      start = i + 1;
    }
  }
  fields.push(row.slice(start));

  return fields.map((field) => field.trim());
}

/** A quoted literal's contents, or null for anything else (a number, null). */
function literal(field: string | undefined): string | null {
  if (!field) return null;
  const match = /^'((?:[^']|'')*)'$/.exec(field);
  return match ? match[1].replace(/''/g, "'") : null;
}

/** Every resource key any migration has ever seeded. */
const resourceKeys = new Set<string>();
/**
 * Resources that name their own module, which is how one added after the
 * entitlements migration does it (#907's `sales` is the first).
 *
 * The backfill in that migration is not the place for them: it is an `update`
 * over rows that already existed, so on a fresh database it runs before the
 * later migration inserts the resource and matches nothing, and on a hosted
 * one it has already run. `resources.module_key` is `not null`, so the insert
 * has to carry the module anyway -- this reads it from where it actually is.
 */
const inlineModules = new Map<string, string>();
for (const name of migrationFiles) {
  const sql = readFileSync(join(MIGRATIONS, name), "utf8");
  for (const match of sql.matchAll(
    /insert into public\.resources \(([^)]*)\) values/g,
  )) {
    const columns = match[1].split(",").map((column) => column.trim());
    const keyColumn = columns.indexOf("key");
    const moduleColumn = columns.indexOf("module_key");
    const from = match.index + match[0].length;
    const to = sql.indexOf(";", from);

    for (const row of valueRows(sql.slice(from, to === -1 ? undefined : to))) {
      const fields = valueFields(row);
      const key = literal(fields[keyColumn]);
      if (!key) continue;
      resourceKeys.add(key);

      const moduleKey =
        moduleColumn === -1 ? null : literal(fields[moduleColumn]);
      if (moduleKey) inlineModules.set(key, moduleKey);
    }
  }
}

const entitlements = readFileSync(join(MIGRATIONS, ENTITLEMENTS), "utf8");

/** key -> is_core, from the modules seed. */
const catalog = new Map<string, boolean>();
for (const body of statementsAfter(
  entitlements,
  /insert into public\.modules \([^)]*\) values/g,
)) {
  for (const row of body.matchAll(
    /\(\s*'([a-z0-9_]+)'\s*,.*?,\s*(?:true|false)\s*,\s*(true|false)\s*\)/g,
  )) {
    catalog.set(row[1], row[2] === "true");
  }
}

/** resource key -> module key, from the backfill. */
const backfill = new Map<string, string>();
{
  const start = entitlements.indexOf("update public.resources res");
  const end = entitlements.indexOf(
    "as v(resource_key, module_key)",
    start === -1 ? 0 : start,
  );
  const body = entitlements.slice(start, end);
  for (const row of body.matchAll(/\('([a-z0-9_]+)',\s*'([a-z0-9_]+)'\)/g)) {
    backfill.set(row[1], row[2]);
  }
}

/**
 * The two sources together: the backfill for everything that existed when
 * modules landed, the insert's own `module_key` for everything since.
 */
const mapping = new Map([...backfill, ...inlineModules]);

describe("the catalogs parse at all", () => {
  // Everything below is a set difference, and a set difference against an
  // empty set passes silently. These are the assertions that stop a regex
  // drifting off its statement and turning the whole file green.
  test("both were found in the migration", () => {
    expect(catalog.size).toBeGreaterThan(10);
    expect(backfill.size).toBeGreaterThan(30);
    expect(resourceKeys.size).toBe(mapping.size);
  });

  // The inline reader is the half with no second witness: the backfill's
  // absence shows up as an unmapped resource below, but a regression that
  // stopped finding `module_key` on an insert would simply see fewer inline
  // rows -- and every one of them would then fail "none is left out" with a
  // misleading message. Pin the one that exists.
  test("a resource added after the modules migration names its own module", () => {
    expect(inlineModules.get("sales")).toBe("finance");
  });
});

describe("every resource belongs to a module", () => {
  test("none is left out", () => {
    const unmapped = [...resourceKeys]
      .filter((key) => !mapping.has(key))
      .sort();
    expect(
      unmapped,
      `Resources with no module: ${unmapped.join(", ")}. A resource added after ${ENTITLEMENTS} names its module in its own insert -- add the module_key column to it. The backfill in that migration is only for what already existed.`,
    ).toEqual([]);
  });

  test("none is mapped to a module that does not exist", () => {
    const unknown = [...mapping.entries()]
      .filter(([, moduleKey]) => !catalog.has(moduleKey))
      .map(([key, moduleKey]) => `${key} -> ${moduleKey}`)
      .sort();
    expect(unknown).toEqual([]);
  });

  test("no module is empty", () => {
    const used = new Set(mapping.values());
    const empty = [...catalog.keys()].filter((key) => !used.has(key)).sort();
    expect(
      empty,
      `Modules with no resources: ${empty.join(", ")}. A module nobody can be gated out of is a row in a table, not a product.`,
    ).toEqual([]);
  });
});

describe("the mappings that are product decisions", () => {
  // resources.section says Events for both. They are the money tabs on an
  // event, and a tenant that is not buying Finance should not see money on an
  // event detail page -- so turning Finance off takes two tabs off Events,
  // deliberately. Changing this should mean changing this test.
  test("event money goes with Finance, not with Events", () => {
    expect(mapping.get("event_expenses")).toBe("finance");
    expect(mapping.get("event_revenue")).toBe("finance");
  });

  // is_platform_operator() calls has_permission(), so a module check able to
  // disable platform_tenants would gate the operator out of the page that
  // un-gates things -- a one-way door.
  test("the platform's own control panel sits in a core module", () => {
    const moduleKey = mapping.get("platform_tenants");
    expect(moduleKey).toBeDefined();
    expect(catalog.get(moduleKey!)).toBe(true);
  });

  // Everything else names a person; a portal with no People screen is not a
  // portal, and neither is one with no way to administer it.
  test("people and administration are the core modules", () => {
    const core = [...catalog.entries()]
      .filter(([, isCore]) => isCore)
      .map(([key]) => key)
      .sort();
    expect(core).toEqual(["administration", "people"]);
  });
});
