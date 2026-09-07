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

// What the guard is actually about is whether the address could ever belong to
// somebody: #708's hazard is that a grant follows an address, so whoever
// registers it first receives it. An address nobody can register is therefore
// not a finding.
//
// RFC 2606 and RFC 6761 reserve `.test`, `.invalid`, `.example` and
// `.localhost` as top-level domains, and example.com/net/org as names, for
// exactly that purpose -- nothing is ever delegated under them. So those are
// allowed and everything else is not. (Previously only `example.test` and
// `example.com` were spelled out, which let the seed fixtures through but
// flagged `@demo.invalid`, the more explicitly unregisterable of the two.)
const EMAIL_LITERAL = /'[^']*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})'/g;
const RESERVED_TLD = /\.(test|invalid|example|localhost)$/i;
const RESERVED_NAME = /^example\.(com|net|org)$/i;

function hasRealEmail(sql: string): boolean {
  return [...sql.matchAll(EMAIL_LITERAL)].some(([, domain]) => {
    const host = domain.toLowerCase();
    return !RESERVED_TLD.test(host) && !RESERVED_NAME.test(host);
  });
}

describe("supabase migrations", () => {
  test("there are migrations to check", () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  // The scan below is only as good as this predicate, and this predicate is the
  // whole of #708's guard, so it gets its own cases rather than being trusted
  // because the corpus happens to pass.
  test("a real address is still a finding", () => {
    expect(hasRealEmail("values ('someone@chattersnow.org')")).toBe(true);
    expect(hasRealEmail("values ('person@gmail.com')")).toBe(true);
    // A reserved *name* under a real TLD, not a reserved TLD.
    expect(hasRealEmail("values ('a@notexample.com')")).toBe(true);
  });

  test("a reserved address is not", () => {
    expect(hasRealEmail("values ('admin@example.test')")).toBe(false);
    expect(hasRealEmail("values ('rowan@demo.invalid')")).toBe(false);
    expect(hasRealEmail("values ('a@example.com')")).toBe(false);
  });

  test.each(migrationFiles)("%s contains no real email literal", (file) => {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const offending = sql
      .split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      // Comments may legitimately mention an address; only statements matter.
      .filter(({ line }) => !line.trimStart().startsWith("--"))
      .filter(({ line }) => hasRealEmail(line));

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
        hasRealEmail(sql.replace(/^\s*--.*$/gm, ""));

      expect(grantsByEmail).toBe(false);
    },
  );
});
