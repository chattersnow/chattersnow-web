import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Testing Library's `configure()` writes to a process-wide config, and Bun
// preloads one module registry per process -- so a call at module scope is a
// setting one test file imposes on every other one the runner reaches after
// it. content-editor.dom.test.tsx did exactly that with a 5s
// `asyncUtilTimeout`, which meant whether preview-panel.dom.test.tsx ran
// against a 1s budget or a 5s one depended on run order rather than on its own
// code, and any measurement of either was meaningless unless it ran alone
// (#1381).
//
// A file that wants a different budget either passes it per wait (the `SETTLE`
// constant several files use) or sets it in a `beforeEach`/`afterEach` pair
// that puts it back. This fails at the moment the next one is written.

const ROOT = join(import.meta.dir, "..");

/** `configure(` at the start of a line: outside every block, so at module scope. */
const MODULE_SCOPE_CONFIGURE = /^configure\(/m;

function trackedTestFiles(): string[] {
  const result = Bun.spawnSync(
    ["git", "ls-files", "-z", "--", "*.test.ts", "*.test.tsx"],
    { cwd: ROOT },
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `git ls-files failed: ${result.stderr.toString().trim() || "no output"}`,
    );
  }
  return result.stdout.toString().split("\0").filter(Boolean);
}

test("no test file configures Testing Library at module scope", () => {
  const offenders = trackedTestFiles().filter((path) =>
    MODULE_SCOPE_CONFIGURE.test(readFileSync(join(ROOT, path), "utf8")),
  );

  expect(offenders).toEqual([]);
});
