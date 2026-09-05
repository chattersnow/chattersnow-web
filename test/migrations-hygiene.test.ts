import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Guards the fix in #708. Two migrations used to bootstrap privilege by
// matching a hardcoded personal email against auth.users, which meant the grant
// followed an address rather than a fixed user id -- in any database where that
// address was unregistered (a fresh project, staging, or a white-label
// deployment) whoever registered it first would have received admin. This test
// exists so the pattern cannot come back unnoticed.

const MIGRATIONS_DIR = join(import.meta.dir, "..", "supabase", "migrations");

const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();

// Deliberately allows the example.test addresses used by supabase/seed.sql --
// those are local fixtures, not real accounts, and they live outside this
// directory anyway.
const REAL_EMAIL =
  /'[^']*@(?!example\.(test|com)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}'/;

describe("supabase migrations", () => {
  test("there are migrations to check", () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  test.each(migrationFiles)("%s contains no real email literal", (file) => {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const offending = sql
      .split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      // Comments may legitimately mention an address; only statements matter.
      .filter(({ line }) => !line.trimStart().startsWith("--"))
      .filter(({ line }) => REAL_EMAIL.test(line));

    expect(
      offending.map(({ number, line }) => `${file}:${number} ${line.trim()}`),
    ).toEqual([]);
  });

  test.each(migrationFiles)(
    "%s does not grant a role by matching an email",
    (file) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      const grantsByEmail =
        /insert\s+into\s+public\.user_roles/i.test(sql) &&
        REAL_EMAIL.test(sql.replace(/^\s*--.*$/gm, ""));

      expect(grantsByEmail).toBe(false);
    },
  );
});
