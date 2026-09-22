import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Base UI toasts render with role="dialog" so keyboard users can reach them
// with F6, which means a bare `getByRole("dialog")` also matches the "Saved."
// confirmation that appears the moment a form dialog closes -- exactly when a
// spec asserts the dialog is gone. `modal()` in e2e/helpers/dialog.ts is the
// locator that excludes them, and six sites had grown up beside it anyway
// (#1382). Two of those papered over the ambiguity with `.first()`, which is
// the worse failure: it does not go red, it silently asserts against the
// toast.
//
// The helper is the one place the raw role belongs. This fails at the moment
// the seventh site is written rather than the first time a toast happens to be
// on screen.

const ROOT = join(import.meta.dir, "..");

/** The only file allowed to name the role directly. */
const HELPER = "e2e/helpers/dialog.ts";

const BARE_DIALOG = /getByRole\("dialog"\)/;

function trackedE2eFiles(): string[] {
  const result = Bun.spawnSync(["git", "ls-files", "-z", "--", "e2e"], {
    cwd: ROOT,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ls-files failed: ${result.stderr.toString().trim() || "no output"}`,
    );
  }
  return result.stdout
    .toString()
    .split("\0")
    .filter((path) => path.endsWith(".ts") && path !== HELPER);
}

test(`only ${HELPER} locates a dialog by its role`, () => {
  const offenders = trackedE2eFiles().filter((path) =>
    BARE_DIALOG.test(readFileSync(join(ROOT, path), "utf8")),
  );

  expect(offenders).toEqual([]);
});
