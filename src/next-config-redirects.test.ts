import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import nextConfig from "../next.config";

/**
 * The guard #1145 did not have.
 *
 * `next.config.ts` redirects are matched before `src/proxy.ts` runs and carry
 * no idea what host they are on. On a `portal.` host the proxy strips the
 * `/portal` prefix, so every portal page is also served at a bare path -- which
 * means a public-site redirect whose source collides with one of those paths
 * hijacks the portal on exactly the hosts that matter most and nowhere else.
 * That is how `/events/:id(uuid)` -> `/events/e/:id`, a fix for the public
 * calendar, 404'd every event in the portal while previews, the demo tenant
 * and every local run stayed green.
 *
 * Reading the route folders rather than listing them keeps this honest as the
 * portal grows: a new `src/app/portal/(app)/<name>` closes its own bare path
 * off to this file automatically, without anyone remembering to come here.
 */
const portalSegments = readdirSync(
  join(import.meta.dir, "app", "portal", "(app)"),
  { withFileTypes: true },
)
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("@"))
  .map((entry) => entry.name);

const firstSegment = (source: string) => source.split("/")[1] ?? "";

describe("next.config.ts redirects", () => {
  test("the portal has route folders to check against", () => {
    // Guards the guard: a bad path would make every assertion below vacuous.
    expect(portalSegments).toContain("events");
  });

  test("no redirect source collides with a portal route's bare path", async () => {
    const redirects = await nextConfig.redirects!();

    const collisions = redirects
      .filter((redirect) =>
        portalSegments.includes(firstSegment(redirect.source)),
      )
      // A rule that has already been scoped to non-portal hosts is fine; it is
      // the host-blind ones that take the portal down.
      .filter(
        (redirect) =>
          !redirect.missing?.some((condition) => condition.type === "host") &&
          !redirect.has?.some((condition) => condition.type === "host"),
      )
      .map((redirect) => redirect.source);

    expect(collisions).toEqual([]);
  });
});
