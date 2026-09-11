// The module catalog (#900), checked against the resource catalog it partitions.
//
// Both live in SQL, so this reads the migrations rather than a TypeScript
// constant -- the same thing page-visibility.test.ts does when it checks that
// every registered slot has a gate on disk. The `not null` on
// `resources.module_key` already makes an unmapped resource impossible; what a
// constraint cannot give you is the message. "Resources with no module:
// artwork_submissions" tells whoever added a resource next month what to do,
// and it says it in `bun run test` rather than on the first `db:reset`.
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

/** Every resource key any migration has ever seeded. */
const resourceKeys = new Set<string>();
for (const name of migrationFiles) {
  const sql = readFileSync(join(MIGRATIONS, name), "utf8");
  for (const body of statementsAfter(
    sql,
    /insert into public\.resources \([^)]*\) values/g,
  )) {
    for (const row of body.matchAll(/\(\s*'([a-z0-9_]+)'\s*,/g)) {
      resourceKeys.add(row[1]);
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
const mapping = new Map<string, string>();
{
  const start = entitlements.indexOf("update public.resources res");
  const end = entitlements.indexOf(
    "as v(resource_key, module_key)",
    start === -1 ? 0 : start,
  );
  const body = entitlements.slice(start, end);
  for (const row of body.matchAll(/\('([a-z0-9_]+)',\s*'([a-z0-9_]+)'\)/g)) {
    mapping.set(row[1], row[2]);
  }
}

describe("the catalogs parse at all", () => {
  // Everything below is a set difference, and a set difference against an
  // empty set passes silently. These are the assertions that stop a regex
  // drifting off its statement and turning the whole file green.
  test("both were found in the migration", () => {
    expect(catalog.size).toBeGreaterThan(10);
    expect(mapping.size).toBeGreaterThan(30);
    expect(resourceKeys.size).toBe(mapping.size);
  });
});

describe("every resource belongs to a module", () => {
  test("none is left out", () => {
    const unmapped = [...resourceKeys]
      .filter((key) => !mapping.has(key))
      .sort();
    expect(
      unmapped,
      `Resources with no module: ${unmapped.join(", ")}. Add them to the map in ${ENTITLEMENTS}.`,
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
