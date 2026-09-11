// Every link the sidebar renders must survive the guards on the route it
// points at (#903).
//
// The sidebar decides what to show from nav.ts's `access`; the route decides
// who gets in from the `requirePermission()` / `requireAnyPermission()` calls
// in its layouts. Nothing made the two agree, and where they disagreed the
// symptom was a link the app itself rendered that bounced to
// /portal/home?denied=..., which is worse than a 404 because it looks like the
// permission system is broken.
//
// Module entitlements are what turned that from latent into reachable.
// Reimbursements is its own module living under the /portal/finance prefix, so
// a tenant sold Reimbursements and not Finance got a Reimbursements link in the
// sidebar that finance/layout.tsx refused -- a shape no role had produced
// before, because every role with reimbursements also had some finance access.
//
// Like module-catalog.test.ts, this reads the source on disk rather than a
// constant: the guards are spread over 48 layout files and the only way to
// know they agree with the nav is to look at them.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PermissionCheck, PermissionLevel } from "@/lib/auth/permissions";
import { hasAnyPermission } from "@/lib/auth/permissions";
import { NAV_ITEMS } from "./nav";

const APP_ROOT = join(import.meta.dir, "../../app/portal/(app)");

/**
 * The checks one layout enforces, as an OR-list -- the shape both
 * `requirePermission` (one check) and `requireAnyPermission` (several) reduce
 * to. An empty list means the file has no guard.
 */
function guardsIn(layoutPath: string): PermissionCheck[] {
  if (!existsSync(layoutPath)) return [];
  const source = readFileSync(layoutPath, "utf8");

  // requirePermission(supabase, "resource", "level", ...)
  const single = source.match(
    /requirePermission\(\s*\w+\s*,\s*"([a-z0-9_]+)"\s*,\s*"(none|view|manage)"/,
  );
  if (single) {
    return [{ resource: single[1], level: single[2] as PermissionLevel }];
  }

  // requireAnyPermission(supabase, [ { resource: "x", level: "y" }, ... ], ...)
  const anyBlock = source.match(
    /requireAnyPermission\(\s*\w+\s*,\s*\[([\s\S]*?)\]/,
  );
  if (!anyBlock) return [];
  return [
    ...anyBlock[1].matchAll(
      /resource:\s*"([a-z0-9_]+)"\s*,\s*level:\s*"(none|view|manage)"/g,
    ),
  ].map((match) => ({
    resource: match[1],
    level: match[2] as PermissionLevel,
  }));
}

/** Every layout between the portal shell and `href`, outermost first. */
function guardChain(
  href: string,
): { path: string; guards: PermissionCheck[] }[] {
  const segments = href
    .split("?")[0]
    .replace(/^\/portal\/?/, "")
    .split("/")
    .filter(Boolean);

  const chain: { path: string; guards: PermissionCheck[] }[] = [];
  let dir = APP_ROOT;
  for (const segment of segments) {
    dir = join(dir, segment);
    const layout = join(dir, "layout.tsx");
    const guards = guardsIn(layout);
    if (guards.length > 0) {
      chain.push({ path: `${segment}/layout.tsx`, guards });
    }
  }
  return chain;
}

/** Every link the sidebar can render, with the access that reveals it. */
function navLinks(): {
  label: string;
  href: string;
  access: PermissionCheck[];
}[] {
  const links: { label: string; href: string; access: PermissionCheck[] }[] =
    [];
  for (const item of NAV_ITEMS) {
    if (item.subItems) {
      for (const sub of item.subItems) {
        links.push({
          label: `${item.label} > ${sub.label}`,
          href: sub.href,
          // alsoRequires narrows what the sidebar shows, so a link that
          // carries one is revealed by *less* than `access` alone -- which
          // makes checking `access` the stricter test, not the looser one.
          access: [...sub.access],
        });
      }
    } else if (item.access) {
      links.push({
        label: item.label,
        href: item.href,
        access: [...item.access],
      });
    }
  }
  return links;
}

describe("sidebar links against their routes' guards", () => {
  test("every way of seeing a link is a way of opening it", () => {
    const deadEnds: string[] = [];

    for (const link of navLinks()) {
      const chain = guardChain(link.href);
      for (const alternative of link.access) {
        // The narrowest reader the sidebar would show this link to: exactly
        // one grant, at exactly the level nav.ts asks for.
        const permissions = { [alternative.resource]: alternative.level };
        for (const layer of chain) {
          if (!hasAnyPermission(permissions, layer.guards)) {
            deadEnds.push(
              `${link.label} (${link.href}) is shown to ${alternative.resource}:${alternative.level} but ${layer.path} refuses it`,
            );
          }
        }
      }
    }

    expect(deadEnds).toEqual([]);
  });

  test("the guard parser actually finds guards", () => {
    // Without this, a rename of requireAnyPermission would turn the test above
    // into one that asserts nothing at all and stays green forever.
    expect(guardChain("/portal/finance/reimbursements").length).toBe(2);
    expect(guardChain("/portal/people").length).toBeGreaterThan(0);
  });
});
