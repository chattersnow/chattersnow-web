// Fails when a Markdown link in this repo points at a file or a heading that
// does not exist (#1196).
//
//   bun run docs:links
//
// Fourteen `](file.md#anchor)` links had accumulated across docs/ before this
// existed, most of them because GitHub's slug algorithm does not collapse the
// gap a deleted character leaves behind: `## 6. Data model — Multi-tenancy`
// is `#6-data-model--multi-tenancy`, with two hyphens, and every link in the
// repo wrote one. Following such a link lands the reader at the top of the
// target file instead of the section it names, which nothing else in CI
// noticed and no reviewer reliably does either.
//
// Only links a repository reader can follow are checked: relative paths to
// files in the working tree, and anchors resolved against the headings of the
// file they name. External URLs and mailto: are left alone -- checking those
// means network calls, which is a different job with a different failure mode
// (a flaky one).
//
// It lives in tools/ rather than scripts/ for the same reason
// stamp-copyright-headers.mjs does: scripts/ is gitignored for local-only
// operator helpers, and CI has to run this from a clean checkout.

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, normalize, relative, resolve } from "node:path";

/**
 * GitHub's heading slug, which is not the one most generators use: it
 * lowercases, **deletes** every character that is not a word character, a
 * space or a hyphen, and only then turns spaces into hyphens -- without
 * collapsing the runs that leaves behind. An em dash or a slash in a heading
 * therefore yields a doubled hyphen in its anchor.
 */
export function headingSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_ -]/gu, "")
    .replace(/ /g, "-");
}

/** Strips the inline Markdown a heading's visible text does not include. */
function headingText(raw: string): string {
  return raw
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .trim();
}

/**
 * Every anchor a file offers: one per heading, plus the `-1`, `-2` suffixes
 * GitHub appends when two headings slug the same, plus any explicit
 * `<a id="…">`/`name="…"` in the prose.
 */
export function anchorsOf(markdown: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();

  for (const line of contentLines(markdown)) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      const slug = headingSlug(headingText(heading[1]));
      if (slug) {
        const count = seen.get(slug) ?? 0;
        seen.set(slug, count + 1);
        anchors.add(count === 0 ? slug : `${slug}-${count}`);
      }
    }
    for (const explicit of line.matchAll(/<a\s+[^>]*(?:id|name)="([^"]+)"/g)) {
      anchors.add(explicit[1]);
    }
  }

  return anchors;
}

/** The lines outside fenced code blocks, where headings and links count. */
function contentLines(markdown: string): string[] {
  const lines: string[] = [];
  let fence: string | null = null;

  for (const line of markdown.split("\n")) {
    const marker = /^\s*(```+|~~~+)/.exec(line)?.[1];
    if (fence !== null) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length)
        fence = null;
      continue;
    }
    if (marker) {
      fence = marker;
      continue;
    }
    lines.push(line);
  }

  return lines;
}

export type DocLink = { line: number; target: string };

/** Every `](…)` destination in a file, with the line it sits on. */
export function linksOf(markdown: string): DocLink[] {
  const links: DocLink[] = [];

  contentLines(markdown).forEach((line, index) => {
    for (const match of line.matchAll(
      /\]\(<?([^)<>\s]+)>?(?:\s+"[^"]*")?\)/g,
    )) {
      links.push({ line: index + 1, target: match[1] });
    }
  });

  return links;
}

export type Broken = {
  file: string;
  line: number;
  target: string;
  reason: string;
};

/** What a relative link's path resolves to in the working tree. */
export type Target =
  { kind: "file"; text: string } | { kind: "directory" } | null;

/**
 * Checks one file's links against `read`, which resolves a repo-relative path
 * in the working tree. Kept free of the filesystem so the rules are testable
 * without a fixture tree on disk.
 */
export function brokenLinksIn(
  file: string,
  markdown: string,
  read: (path: string) => Target,
): Broken[] {
  const broken: Broken[] = [];

  for (const { line, target } of linksOf(markdown)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//"))
      continue;

    const [path, anchor] = splitAnchor(target);

    if (path === "") {
      if (anchor && !anchorsOf(markdown).has(anchor)) {
        broken.push({
          file,
          line,
          target,
          reason: `no anchor #${anchor} in this file`,
        });
      }
      continue;
    }

    const resolved = normalize(`${dirname(file)}/${path}`).replace(/\/+$/, "");
    const found = read(resolved);

    if (found === null) {
      broken.push({ file, line, target, reason: `no such file: ${resolved}` });
    } else if (
      found.kind === "file" &&
      anchor &&
      !anchorsOf(found.text).has(anchor)
    ) {
      broken.push({
        file,
        line,
        target,
        reason: `${resolved} has no anchor #${anchor}`,
      });
    }
  }

  return broken;
}

function splitAnchor(target: string): [string, string | null] {
  const hash = target.indexOf("#");
  if (hash === -1) return [decode(target), null];
  return [decode(target.slice(0, hash)), decode(target.slice(hash + 1))];
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

if (import.meta.main) {
  const root = resolve(import.meta.dirname, "..");

  const cache = new Map<string, Target>();
  const read = (path: string): Target => {
    if (!cache.has(path)) {
      const absolute = resolve(root, path);
      const inside = !relative(root, absolute).startsWith("..");
      if (!inside || !existsSync(absolute)) cache.set(path, null);
      else if (statSync(absolute).isDirectory())
        cache.set(path, { kind: "directory" });
      else
        cache.set(path, { kind: "file", text: readFileSync(absolute, "utf8") });
    }
    return cache.get(path) ?? null;
  };

  const broken: Broken[] = [];
  let checked = 0;

  for (const file of new Bun.Glob("**/*.md").scanSync({
    cwd: root,
    onlyFiles: true,
  })) {
    if (file.startsWith("node_modules/") || file.startsWith(".next/")) continue;
    const self = read(file);
    checked += 1;
    broken.push(
      ...brokenLinksIn(file, self?.kind === "file" ? self.text : "", read),
    );
  }

  for (const { file, line, target, reason } of broken) {
    console.error(`${file}:${line}  ${target}  --  ${reason}`);
  }

  if (broken.length > 0) {
    console.error(
      `\n${broken.length} broken link(s) across ${checked} Markdown files.`,
    );
    process.exit(1);
  }

  console.log(`All Markdown links resolve (${checked} files).`);
}
