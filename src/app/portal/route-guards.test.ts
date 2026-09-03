import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PORTAL_ROOT = join(import.meta.dir, "(app)");

/**
 * Routes that are deliberately open to any signed-in user, so the sweep below
 * doesn't flag them:
 *  - home: the dashboard everyone lands on; it gates each card individually
 *    rather than the page.
 *  - entry: the post-login router, which only redirects.
 *  - account: a user's own profile, available regardless of resource access.
 */
const INTENTIONALLY_UNGATED = new Set(["home", "entry", "account"]);

/**
 * Known gap, tracked separately: /portal/calendar and its work-queue,
 * templates, and program-suggestions siblings compute `canManage` but never
 * gate on content_calendar:view. A parent layout would be the obvious fix,
 * except calendar/reports is gated on the narrower content_calendar_reports
 * resource, and role permissions are data-driven -- so a parent gate could
 * lock out a hand-granted reports-only user. Needs the per-page treatment,
 * not a copy of this file's one-liner.
 */
const KNOWN_UNGATED = new Set(["calendar"]);

const GUARD = /require(Any)?(Permission|Role)|deniedRedirectHref/;

function isGuarded(section: string) {
  for (const file of ["layout.tsx", "page.tsx"]) {
    const path = join(PORTAL_ROOT, section, file);
    if (existsSync(path) && GUARD.test(readFileSync(path, "utf8"))) return true;
  }
  return false;
}

describe("portal route guards", () => {
  const sections = readdirSync(PORTAL_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(PORTAL_ROOT, name, "page.tsx")));

  test("finds the portal sections to check", () => {
    // Guards against the sweep silently passing because it found nothing.
    expect(sections.length).toBeGreaterThan(10);
    expect(sections).toContain("attendees");
  });

  // Route hiding is not authorization (spec section 7), but a missing guard is
  // still how /portal/attendees shipped as the one people page anyone signed
  // in could open. This sweep is what would have caught it.
  for (const section of sections) {
    if (INTENTIONALLY_UNGATED.has(section) || KNOWN_UNGATED.has(section)) {
      continue;
    }
    test(`/portal/${section} checks a permission before rendering`, () => {
      expect(isGuarded(section)).toBe(true);
    });
  }
});
