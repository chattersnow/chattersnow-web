import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Guards the other half of the policy in .gitignore (#799). Operator scripts
// under scripts/ are local by default, with a short allowlist of the ones the
// repository ships -- and nothing used to check that the allowlist kept up
// with what package.json and the runbooks pointed at. scripts/tenant-cli.ts
// was aliased six times and named in docs/tenants.md while never being
// committed, so on every machine but the one it was written on each alias
// failed with a missing file (#795). This fails at the moment the alias is
// added rather than the first time somebody else runs it.

const ROOT = join(import.meta.dir, "..");

/**
 * A repository-relative path under scripts/ with a runnable extension, as it
 * appears in an alias (`bun scripts/x.ts`) or in prose (`scripts/x.ts`).
 * Directories are not matched: an alias runs a file.
 */
const SCRIPT_PATH = /\bscripts\/[A-Za-z0-9_./-]+?\.(?:ts|tsx|js|mjs|cjs|sh)\b/g;

export function scriptPathsIn(text: string): string[] {
  return [...new Set(text.match(SCRIPT_PATH) ?? [])];
}

function tracked(): Set<string> {
  const result = Bun.spawnSync(["git", "ls-files", "-z", "--", "scripts"], {
    cwd: ROOT,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ls-files failed: ${result.stderr.toString().trim() || "no output"}`,
    );
  }
  return new Set(result.stdout.toString().split("\0").filter(Boolean));
}

function markdownFilesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return markdownFilesUnder(path);
    return name.endsWith(".md") ? [path] : [];
  });
}

/** Every file a person is told to read before running something. */
function runbooks(): string[] {
  const roots = ["CLAUDE.md", "AGENTS.md", "README.md"]
    .map((name) => join(ROOT, name))
    .filter((path) => {
      try {
        return statSync(path).isFile();
      } catch {
        return false;
      }
    });
  return [...roots, ...markdownFilesUnder(join(ROOT, "docs"))];
}

const packageJson = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
) as { scripts: Record<string, string> };

describe("scriptPathsIn", () => {
  // The scan below is only as good as this extractor, so it gets cases of its
  // own rather than being trusted because the corpus happens to pass.
  test("finds the file an alias runs", () => {
    expect(
      scriptPathsIn(
        "bun --env-file=.env.local scripts/tenant-cli.ts provision",
      ),
    ).toEqual(["scripts/tenant-cli.ts"]);
  });

  test("finds a path in prose, once, whatever wraps it", () => {
    expect(
      scriptPathsIn(
        "See `scripts/demo/guards.ts` (and scripts/demo/guards.ts again).",
      ),
    ).toEqual(["scripts/demo/guards.ts"]);
  });

  test("ignores other directories and bare directories", () => {
    expect(
      scriptPathsIn("bun run e2e/a11y-scan.ts; ls scripts/demo/ and scripts/*"),
    ).toEqual([]);
  });
});

describe("scripts/ paths the repository points at", () => {
  const trackedScripts = tracked();

  test("there are aliases to check", () => {
    expect(
      Object.values(packageJson.scripts).some(
        (command) => scriptPathsIn(command).length > 0,
      ),
    ).toBe(true);
  });

  test("every package.json alias runs a file git tracks", () => {
    const missing = Object.entries(packageJson.scripts).flatMap(
      ([alias, command]) =>
        scriptPathsIn(command)
          .filter((path) => !trackedScripts.has(path))
          .map((path) => `${alias}: ${path}`),
    );
    // A miss here means the file is ignored by `scripts/*` in .gitignore and
    // needs a `!scripts/...` line beside the others -- or the alias is wrong.
    expect(missing).toEqual([]);
  });

  test("every runbook names a file git tracks", () => {
    const missing = runbooks().flatMap((file) =>
      scriptPathsIn(readFileSync(file, "utf8"))
        .filter((path) => !trackedScripts.has(path))
        .map((path) => `${relative(ROOT, file)}: ${path}`),
    );
    expect(missing).toEqual([]);
  });
});
