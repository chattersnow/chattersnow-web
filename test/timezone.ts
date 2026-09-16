import { afterAll } from "bun:test";

/**
 * Pin the process timezone for one test file, and hand it back when the file
 * is done.
 *
 * `bun test` runs many files in one process -- `--isolate` gives each its own
 * module registry, not its own `process.env` -- so a file that assigns
 * `process.env.TZ` at module scope and walks away is formatting every file
 * that loads after it. That stayed invisible while the suite ran in one fixed
 * order and surfaced the moment it was sharded (#1170): with the files
 * regrouped, `receipt.test.ts` pinned Sydney and
 * `event-registration-confirmation-email.test.ts`, which asserts a UTC label,
 * read back `GMT+11`.
 *
 * Call it at the top of the file, before the first test. The imports above it
 * are still evaluated first -- ESM hoists them -- which is fine as long as no
 * imported module reads the zone at import time; none do, they build their
 * formatters per call.
 */
export function pinTimezone(zone: string): void {
  const original = process.env.TZ;
  process.env.TZ = zone;

  afterAll(() => {
    // Assigning `undefined` would leave the string "undefined" behind, which
    // is not a zone anything can parse.
    if (original === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = original;
    }
  });
}
