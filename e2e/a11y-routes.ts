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
 * Each entry names a list page and the shape of the link to follow, so the scan
 * uses whatever the seed actually produced rather than a hard-coded id that
 * goes stale the next time seed.sql changes. A pattern with no resolver is
 * reported as skipped rather than silently dropped.
 */
export const DYNAMIC_ROUTE_SOURCES: Record<
  string,
  { listPath: string; linkPattern: RegExp }
> = {
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
