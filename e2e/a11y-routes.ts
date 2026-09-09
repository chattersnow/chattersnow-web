// Route discovery for the a11y scan (issue #477).
//
// The scan used to carry a hand-written list of routes. It drifted: the list
// named 70 paths while `src/app` had 92 page.tsx files, so 22 routes had never
// been scanned -- including /portal/login, the one page every user must get
// through. Nobody had done anything wrong; a list maintained by hand simply
// cannot keep up with a route tree this size.
//
// So the list is derived from the filesystem instead. A new page.tsx is scanned
// the day it lands, and the only thing that needs maintaining is the small set
// of deliberate exceptions below.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { LEGAL_PAGES_PUBLISHED } from "../src/lib/legal-pages";

export type RouteKind = "public" | "portal" | "auth";

export type DiscoveredRoute = {
  /** The route pattern as it appears in the app tree, e.g. /portal/people/[id]. */
  pattern: string;
  kind: RouteKind;
  isDynamic: boolean;
};

/**
 * Routes with no rendered page of their own. Each needs a reason -- "it errors"
 * is not one, that is a finding.
 */
const SKIP: Record<string, string> = {
  "/portal": "redirect shim to /portal/login or /portal/entry",
  "/portal/entry": "redirect shim to /portal/home",
  // The legal documents render notFound() until the board's legal review
  // approves them (#769, src/lib/legal-pages.ts). Their page.tsx files exist,
  // so discovery finds them, but while the gate is on there is nothing of
  // theirs to scan -- all three would be a third scan of the same 404 page.
  // Keyed off the flag rather than listed outright so the day it flips they
  // come back into the sweep on their own.
  ...(LEGAL_PAGES_PUBLISHED
    ? {}
    : {
        "/privacy": "gated behind LEGAL_PAGES_PUBLISHED (#769)",
        "/terms": "gated behind LEGAL_PAGES_PUBLISHED (#769)",
        "/code-of-conduct": "gated behind LEGAL_PAGES_PUBLISHED (#769)",
      }),
};

const APP_DIR = join(import.meta.dirname, "..", "src", "app");

/** Strips Next.js route groups: /portal/(app)/events -> /portal/events. */
function stripRouteGroups(path: string): string {
  return path.replace(/\/\([^)]+\)/g, "") || "/";
}

function walk(dir: string, urlPath: string, found: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_") || entry.name === "api") continue;
      // Parallel-route slots (@modal) have no URL of their own: what they hold
      // is another route's pattern, rendered over the page the visitor is
      // already on. Walking into one would invent paths like
      // /events/@modal/(.)[id] that no browser can ask for. The overlay itself
      // is scanned as a transient surface instead -- see a11y-surfaces.ts.
      if (entry.name.startsWith("@")) continue;
      walk(join(dir, entry.name), `${urlPath}/${entry.name}`, found);
    } else if (entry.name === "page.tsx") {
      found.push(stripRouteGroups(urlPath) || "/");
    }
  }
}

function classify(pattern: string): RouteKind {
  if (pattern === "/portal/login" || pattern === "/portal/set-password") {
    return "auth";
  }
  return pattern.startsWith("/portal") ? "portal" : "public";
}

export function discoverRoutes(): DiscoveredRoute[] {
  const found: string[] = [];
  walk(APP_DIR, "", found);

  return [...new Set(found)]
    .filter((pattern) => !(pattern in SKIP))
    .sort()
    .map((pattern) => ({
      pattern,
      kind: classify(pattern),
      isDynamic: pattern.includes("["),
    }));
}

export const SKIPPED_ROUTES = SKIP;

/**
 * How to turn a dynamic route pattern into a real URL.
 *
 * Most entries name a list page and the shape of the link to follow, so the
 * scan uses whatever the seed actually produced rather than a hard-coded id
 * that goes stale the next time seed.sql changes. That stays the default.
 *
 * A `path` entry is the escape hatch for a route nothing links to. It only
 * works because the record it points at now has a literal id in seed.sql (#665);
 * don't reach for it where a link exists. `expectHeading` is what keeps it
 * honest: following a link proves the record exists, a hard-coded id proves
 * nothing, so a `path` has to name the heading its record renders and the scan
 * checks for it before scanning. Nothing uses it at the moment -- /events/[id]
 * was the last orphan, and #847 gave the listing an anchor to follow -- but it
 * stays for the next route that ends up without one.
 *
 * A pattern with no resolver is reported as skipped rather than silently
 * dropped.
 */
export type DynamicRouteSource =
  | { listPath: string; linkPattern: RegExp }
  | { path: string; expectHeading: string };

export const DYNAMIC_ROUTE_SOURCES: Record<string, DynamicRouteSource> = {
  "/events/[id]": {
    listPath: "/events",
    linkPattern: /^\/events\/[0-9a-f-]{36}$/,
  },
  "/learn/[slug]": {
    listPath: "/learn",
    linkPattern: /^\/learn\/[a-z0-9-]+$/,
  },
  "/portal/events/[eventId]": {
    listPath: "/portal/events",
    linkPattern: /^\/portal\/events\/[0-9a-f-]{36}$/,
  },
  "/portal/people/[id]": {
    listPath: "/portal/people",
    linkPattern: /^\/portal\/people\/[0-9a-f-]{36}$/,
  },
  "/portal/calendar/[itemId]": {
    listPath: "/portal/calendar",
    linkPattern: /^\/portal\/calendar\/[0-9a-f-]{36}$/,
  },
  "/portal/calendar/templates/[templateId]": {
    listPath: "/portal/calendar/templates",
    linkPattern: /^\/portal\/calendar\/templates\/[0-9a-f-]{36}$/,
  },
  "/portal/governance/meetings/[meetingId]": {
    listPath: "/portal/governance/meetings",
    linkPattern: /^\/portal\/governance\/meetings\/[0-9a-f-]{36}$/,
  },
  "/portal/inventory/donations/[donationId]": {
    listPath: "/portal/inventory/donations",
    linkPattern: /^\/portal\/inventory\/donations\/[0-9a-f-]{36}$/,
  },
  "/portal/inventory/distribution/[movementId]": {
    listPath: "/portal/inventory/distribution",
    linkPattern: /^\/portal\/inventory\/distribution\/[0-9a-f-]{36}$/,
  },
  "/portal/administration/access-management/assets/[assetId]": {
    listPath: "/portal/administration/access-management",
    linkPattern:
      /^\/portal\/administration\/access-management\/assets\/[0-9a-f-]{36}$/,
  },
};
