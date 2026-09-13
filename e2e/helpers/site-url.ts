// Where a local browser run points, and therefore which server it is allowed
// to attach to (#809).
//
// playwright.config.ts reuses a server already listening on the base URL, so
// a developer's open `bun run dev` serves the suite. With more than one
// checkout on the machine that reuse has a bad failure mode: the run attaches
// to whichever checkout holds :3000 and tests *its* code, reporting an ordinary
// assertion failure that blames your diff. A spec asserting a 404 got a 200
// from another worktree's dev server on `development`, and nothing said so.
//
// The fix is a port per checkout, for the checkouts where the collision
// happens. The primary checkout keeps whatever NEXT_PUBLIC_SITE_URL says, so
// the everyday loop of running the suite against an open dev server is
// unchanged. A git *worktree* -- where `.git` is a file pointing back at the
// primary repository -- gets a port derived from its path, so it only ever
// finds its own server, and the server Playwright starts for it listens there.
// PORT overrides both, for attaching to a server started by hand.

import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_SITE_URL = "http://127.0.0.1:3000";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export type SiteUrl = {
  /** The origin every spec and helper should use. */
  baseURL: string;
  /** The port the server must listen on, or null when the URL is not local. */
  port: string | null;
  /** True when the port came from the checkout path rather than the env. */
  derived: boolean;
};

/** Whether `root` is a linked git worktree rather than the primary checkout. */
export function isGitWorktree(root: string): boolean {
  try {
    return statSync(join(root, ".git")).isFile();
  } catch {
    return false;
  }
}

/**
 * A port in 3100-3999 that is a pure function of the checkout path, so two
 * runs from the same worktree agree and two worktrees almost never collide.
 * The range starts above the ports people pick by hand (3000, 3001, ...).
 */
export function portForCheckout(root: string): number {
  const digest = createHash("sha256").update(root).digest();
  return 3100 + (digest.readUInt16BE(0) % 900);
}

export function resolveSiteUrl(
  env: Record<string, string | undefined>,
  root: string,
): SiteUrl {
  const url = new URL(env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL);
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    return { baseURL: url.origin, port: null, derived: false };
  }
  if (env.PORT) {
    url.port = env.PORT;
    return { baseURL: url.origin, port: env.PORT, derived: false };
  }
  if (isGitWorktree(root)) {
    url.port = String(portForCheckout(root));
    return { baseURL: url.origin, port: url.port, derived: true };
  }
  return { baseURL: url.origin, port: url.port || "80", derived: false };
}
