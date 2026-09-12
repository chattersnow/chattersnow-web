import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const PORTAL_ROOT = join(import.meta.dir, "(app)");

/**
 * Sections that are deliberately open to any signed-in user, so the sweep below
 * doesn't flag them or anything nested under them:
 *  - home: the dashboard everyone lands on; it gates each card individually
 *    rather than the page.
 *  - entry: the post-login router, which only redirects.
 *  - account: a user's own profile, available regardless of resource access.
 */
const INTENTIONALLY_UNGATED = new Set(["home", "entry", "account"]);

/**
 * Routes whose page only redirects somewhere else. They render nothing and
 * read nothing, so the guard that matters is the destination's -- and adding
 * one here would only decide which of two identical denials a reader sees,
 * at the cost of a permission round trip on a route that returns a 307.
 *
 * The six People segments moved under /portal/people in #957 and left these
 * behind; their destinations sit under people/layout.tsx, which requires
 * `people:view`. Each one is checked below to still *be* a redirect stub, so
 * this list cannot quietly come to cover a real page.
 */
const REDIRECT_STUBS = new Set([
  "donors",
  "sponsors",
  "attendees",
  "staff",
  "partners",
  "organizations",
]);

/** A page that hands the request on rather than rendering anything. */
function isRedirectStub(routeDir: string) {
  const page = join(routeDir, "page.tsx");
  if (!existsSync(page)) return false;
  const source = readFileSync(page, "utf8");
  return (
    /\bredirect\(/.test(source) &&
    // No JSX element anywhere: a page that renders is a page, whatever else
    // it also does. Closing and self-closing tags rather than `<Name`, which
    // a type parameter like `Promise<Record<...>>` also looks like.
    !/<\/[A-Za-z]|\/>/.test(source)
  );
}

const GUARD = /(require(Any)?(Permission|Role)|deniedRedirectHref)\s*\(/;

/** Every route directory under `(app)`, at any depth, that renders a page. */
function findRoutes(dir: string, routes: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(dir, entry.name);
    if (existsSync(join(path, "page.tsx"))) routes.push(path);
    findRoutes(path, routes);
  }
  return routes;
}

function checks(path: string) {
  return existsSync(path) && GUARD.test(readFileSync(path, "utf8"));
}

/**
 * A route is guarded if its own page or layout checks a permission, or if any
 * ancestor *layout* does it on the route's behalf -- Next.js composes layouts
 * from the root down, which is how most of the portal works (one
 * `<section>/layout.tsx` covering every page beneath it). Only layouts are
 * inherited: an ancestor's `page.tsx` renders a different route entirely and
 * guards nothing below it.
 */
function isGuarded(routeDir: string) {
  if (checks(join(routeDir, "page.tsx"))) return true;
  for (let dir = routeDir; ; dir = dirname(dir)) {
    if (checks(join(dir, "layout.tsx"))) return true;
    if (dir === PORTAL_ROOT) return false;
  }
}

describe("portal route guards", () => {
  const routes = findRoutes(PORTAL_ROOT).map((path) =>
    path.slice(PORTAL_ROOT.length + 1),
  );

  test("finds the portal routes to check", () => {
    // Guards against the sweep silently passing because it found nothing.
    expect(routes.length).toBeGreaterThan(40);
    expect(routes).toContain("attendees");
    // A nested route: the sweep used to look only one level deep, which is how
    // the calendar sub-routes went unguarded (#630).
    expect(routes).toContain(join("calendar", "work-queue"));
  });

  // Route hiding is not authorization (spec section 7), but a missing guard is
  // still how /portal/attendees shipped as the one people page anyone signed
  // in could open. This sweep is what would have caught it.
  for (const route of REDIRECT_STUBS) {
    test(`/portal/${route} is still nothing but a redirect`, () => {
      expect(isRedirectStub(join(PORTAL_ROOT, route))).toBe(true);
    });
  }

  for (const route of routes) {
    if (INTENTIONALLY_UNGATED.has(route.split(/[/\\]/)[0])) continue;
    if (REDIRECT_STUBS.has(route)) continue;
    test(`/portal/${route} checks a permission before rendering`, () => {
      expect(isGuarded(join(PORTAL_ROOT, route))).toBe(true);
    });
  }
});
