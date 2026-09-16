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
  // Resolved rather than read, because `TZ` is usually unset -- on CI as well
  // as locally -- and the way back has to be an assignment. `delete
  // process.env.TZ` leaves the pinned zone in force (measured on Bun 1.3.14:
  // set Sydney, delete, and the process is still in Sydney), and a `delete`
  // poisons the assignment after it, so restoring that way silently does
  // nothing at all -- which is how the first attempt at this left #1170's
  // shard 2 failing exactly as it had before.
  const original =
    process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  process.env.TZ = zone;

  afterAll(() => {
    process.env.TZ = original;
  });
}
