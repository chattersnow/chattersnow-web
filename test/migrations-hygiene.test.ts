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

// Guards #1056, the follow-up to the #1051 incident, where two separate
// malformed versions reached `development` without a single check firing and
// between them wedged `db push` for a week.
//
// A version is the primary key of supabase_migrations.schema_migrations, and
// the CLI orders work by it, so the filename is not cosmetic. Two faults got
// through: `20260913240000` was claimed by two different migrations (only one
// row can ever be recorded, and the collision surfaces at the insert rather
// than while each file is applied, so a `db reset` does not reliably fail), and
// hour `24` is not a time at all -- `supabase migration list` gives that away
// by printing the raw digits where it would otherwise print a date, and nothing
// reads that column.
const VERSION_SHAPE = /^(\d{14})_[a-z0-9_]+\.sql$/;

// Twelve files carry an hour between 24 and 38, from before anyone was
// checking. They cannot be renamed now: they are recorded under these exact
// versions in the hosted database, and a rename would present them as twelve
// new migrations to apply on top of a schema that already has them. So they
// are named here, one by one, rather than softened into a rule that lets the
// next one through. The list can only ever shrink.
const VERSIONS_PREDATING_THIS_CHECK = new Set([
  "20260826240000",
  "20260826250000",
  "20260826260000",
  "20260826300000",
  "20260826310000",
  "20260826320000",
  "20260826330000",
  "20260826340000",
  "20260826350000",
  "20260826360000",
  "20260826370000",
  "20260826380000",
]);

// Date.UTC normalises out-of-range parts rather than rejecting them -- hour 24
// becomes 00:00 the next day, September 31st becomes October 1st -- so the
// round-trip back through the getters is what actually does the rejecting.
function isRealUtcTimestamp(version: string): boolean {
  const [year, month, day, hour, minute, second] = [
    version.slice(0, 4),
    version.slice(4, 6),
    version.slice(6, 8),
    version.slice(8, 10),
    version.slice(10, 12),
    version.slice(12, 14),
  ].map(Number);

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}

describe("migration versions", () => {
  // Same reasoning as the email predicate above: the corpus scan is only as
  // good as this function, and the corpus passing proves nothing about the
  // cases it has never contained.
  test("a real timestamp is accepted", () => {
    expect(isRealUtcTimestamp("20260913230000")).toBe(true);
    expect(isRealUtcTimestamp("20260228235959")).toBe(true);
    // A leap day in a year that has one.
    expect(isRealUtcTimestamp("20280229120000")).toBe(true);
  });

  test("an impossible timestamp is rejected", () => {
    // The two shapes #1051 actually shipped.
    expect(isRealUtcTimestamp("20260913240000")).toBe(false);
    expect(isRealUtcTimestamp("20260826380000")).toBe(false);
    expect(isRealUtcTimestamp("20261301000000")).toBe(false); // month 13
    expect(isRealUtcTimestamp("20260931000000")).toBe(false); // September 31st
    expect(isRealUtcTimestamp("20260229000000")).toBe(false); // not a leap year
    expect(isRealUtcTimestamp("20260913236000")).toBe(false); // minute 60
    expect(isRealUtcTimestamp("20260913235960")).toBe(false); // second 60
  });

  test.each(migrationFiles)(
    "%s is named <14 digits>_<snake_case>.sql",
    (file) => {
      expect(VERSION_SHAPE.test(file)).toBe(true);
    },
  );

  test.each(migrationFiles)("%s has a version that is a real time", (file) => {
    const version = file.slice(0, 14);
    if (VERSIONS_PREDATING_THIS_CHECK.has(version)) return;

    expect(isRealUtcTimestamp(version)).toBe(true);
  });

  test("no two migrations claim the same version", () => {
    const byVersion = new Map<string, string[]>();
    for (const file of migrationFiles) {
      const version = file.slice(0, 14);
      byVersion.set(version, [...(byVersion.get(version) ?? []), file]);
    }

    const collisions = [...byVersion.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([version, files]) => `${version}: ${files.join(", ")}`);

    expect(collisions).toEqual([]);
  });

  // Without this, a renamed or deleted migration would leave its exemption
  // behind, and the list would quietly grow into a place where a new bad
  // version could hide.
  test("every exempted version still exists on disk", () => {
    const versions = new Set(migrationFiles.map((file) => file.slice(0, 14)));
    const stale = [...VERSIONS_PREDATING_THIS_CHECK].filter(
      (version) => !versions.has(version),
    );

    expect(stale).toEqual([]);
  });
});
