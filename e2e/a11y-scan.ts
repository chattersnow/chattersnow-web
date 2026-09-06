// Automated a11y scan (issues #240, #477): runs axe-core across every route in
// the app tree and writes a JSON report.
//
// What #477 established is that a passing scan meant less than it looked. The
// old scan took exactly one snapshot per route -- desktop, light theme, signed
// in as admin, initial render, nothing opened -- and reported "0/68 routes have
// violations". That number was a floor, not a clean bill of health. This scan
// widens it along the dimensions that were invisible:
//
//   routes    derived from src/app instead of a hand-written list (22 routes,
//             including /portal/login, had never been scanned)
//   surfaces  sheets, dialogs, alert dialogs, tooltips, selects, form error
//             states, inactive tab panels
//   viewport  mobile as well as desktop
//   theme     dark as well as light -- the theme toggle is live now
//   roles     the other seeded accounts, not just admin
//   tags      wcag22aa added (2.5.8 Target Size, 2.4.11 Focus Not Obscured)
//
// Still a findings tool: it fixes nothing. It can now fail on regressions
// against e2e/a11y-baseline.json (--check), so a fixed violation cannot quietly
// come back the way #436 did.
//
// One caveat when reading the report: seed.sql populates bulk data with
// random(), so the number of rows on a list page -- and therefore the node
// count for a rule like color-contrast -- changes with every db reset. Node
// counts are useful for ranking, not as a figure to quote. The baseline records
// which RULES fire per route/role/viewport/theme, never how many nodes, so it
// is stable across reseeds.
//
// Usage: bun run e2e/a11y-scan.ts [--check] [--update-baseline] [--quick]
// Requires a server on NEXT_PUBLIC_SITE_URL and the local Supabase stack
// seeded. CI serves a production build (`bun run build && bun run start`)
// rather than `next dev`, so no route is compiled on demand mid-scan (#744).
//
// A11Y_WORKERS shards the scan across that many browser contexts (#751). It
// defaults to 4 on CI and 1 everywhere else: concurrent Chromium contexts on
// a dev machine that is also running Docker and Next would only swap.
//
// Navigations deliberately still wait on `networkidle`, which #752 proposed
// replacing. Measured against a production build, this app requests its CSS,
// font and JS chunks 150-330ms AFTER DOMContentLoaded, so a `domcontentloaded`
// wait scans an unstyled page and reports colour-contrast against colours
// neither palette contains. `load` plus a bounded wait for the URL to stop
// changing is closer, but several portal pages replace the URL on mount, and
// navigating away before that lands both destroys the execution context
// applyTheme() runs in and interrupts the NEXT route's goto -- 7 of 20 sampled
// routes failed that way. The whole prize is networkidle's 500ms idle window,
// ~2.3 min across the run, which sharding above already reduces to ~35s of
// wall clock. See #752 for the measurements.
import { chromium, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DYNAMIC_ROUTE_SOURCES,
  SKIPPED_ROUTES,
  discoverRoutes,
  type DiscoveredRoute,
} from "./a11y-routes";
import { OVERLAY_SELECTOR, surfacesFor } from "./a11y-surfaces";

const baseURL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
const args = new Set(process.argv.slice(2));
const CHECK = args.has("--check");
const UPDATE_BASELINE = args.has("--update-baseline");
// --quick drops the extra viewport/theme passes; the full matrix is what CI runs.
const QUICK = args.has("--quick");

const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  // Adds 2.5.8 Target Size (Minimum) and 2.4.11 Focus Not Obscured, both
  // relevant to the portal's size="sm" icon buttons. "best-practice" stays off
  // deliberately: it is advisory, not a conformance target.
  "wcag22aa",
];

const VIEWPORTS = {
  desktop: { width: 1280, height: 720 },
  mobile: { width: 390, height: 844 },
} as const;

type ViewportName = keyof typeof VIEWPORTS;
type ThemeName = "light" | "dark";

/**
 * The passes each route gets.
 *
 * Theme is switched by toggling the `dark` class rather than reloading, and the
 * viewport by resizing, so all three passes reuse one navigation. That keeps a
 * 3x wider scan from costing 3x the wall clock.
 */
const MATRIX: { viewport: ViewportName; theme: ThemeName }[] = QUICK
  ? [{ viewport: "desktop", theme: "light" }]
  : [
      { viewport: "desktop", theme: "light" },
      { viewport: "desktop", theme: "dark" },
      { viewport: "mobile", theme: "light" },
    ];

const SEEDED_PASSWORD = "password123";

/**
 * How many browser contexts scan at once.
 *
 * The scan is ~520 axe passes at ~4s each, and every one of them was run
 * sequentially on a single page -- 34 minutes, and by far the slowest thing in
 * CI (#751). Sharding it across contexts is the whole fix; nothing about a
 * pass depends on the pass before it, because every pass navigates afresh.
 *
 * Defaults to 1 off CI, deliberately: the same laptop is running Docker
 * Desktop, Supabase and a Next server on 8 GB, and four concurrent Chromium
 * contexts against that put it into swap. `bun run test:a11y` with nothing set
 * therefore behaves exactly as it did before this existed.
 */
const A11Y_WORKERS = (() => {
  const raw = process.env.A11Y_WORKERS ?? (process.env.CI ? "4" : "1");
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`A11Y_WORKERS must be a positive integer, got "${raw}".`);
  }
  return parsed;
})();

/** Longest a theme crossfade is waited on before scanning anyway. */
const THEME_TRANSITION_CAP_MS = 1_000;
/** Same idea for a surface's open animation; Base UI's longest is 0.35s. */
const SURFACE_MOTION_CAP_MS = 1_000;

/**
 * Which account scans which routes.
 *
 * admin sees everything, so it carries the full sweep. The other roles exist to
 * catch what only they can render -- gated empty states, partial nav,
 * view-only variants of a page -- so they scan a representative slice rather
 * than all 90 routes, which would multiply runtime for little signal.
 */
const ROLE_SWEEPS: { email: string; label: string; routes: string[] }[] = [
  {
    email: "coordinator@example.test",
    label: "coordinator",
    routes: ["/portal/home", "/portal/events", "/portal/volunteers"],
  },
  {
    email: "finance@example.test",
    label: "finance",
    routes: ["/portal/home", "/portal/finance", "/portal/finance/expenses"],
  },
  {
    email: "board@example.test",
    label: "board",
    routes: ["/portal/home", "/portal/governance", "/portal/programs/reports"],
  },
  {
    email: "volunteer@example.test",
    label: "volunteer",
    routes: ["/portal/home", "/portal/events", "/portal/account"],
  },
  {
    email: "multi@example.test",
    label: "multi",
    routes: ["/portal/home", "/portal/events"],
  },
];

// noaccess@ and former@ are deliberately absent. Both are bounced straight back
// to /portal/login by the per-page auth guard, so a sweep for them scans the
// sign-in form under a portal route's name and reports nine phantom errors. The
// page they actually land on is /portal/login, which the signed-out auth pass
// already covers.

type Violation = {
  id: string;
  impact: string | null | undefined;
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: { target: string[]; html: string; failureSummary?: string }[];
};

type ScanResult = {
  /** Stable identity for baseline comparison. */
  key: string;
  route: string;
  pattern: string;
  role: string;
  viewport: ViewportName;
  theme: ThemeName;
  surface: string;
  error?: string;
  violations: Violation[];
};

const results: ScanResult[] = [];
const skipped: { pattern: string; reason: string }[] = [];

function keyFor(parts: {
  pattern: string;
  role: string;
  viewport: string;
  theme: string;
  surface: string;
}) {
  return `${parts.role}|${parts.viewport}|${parts.theme}|${parts.pattern}|${parts.surface}`;
}

/**
 * The identity the baseline is keyed on -- deliberately coarser than the scan
 * key: it drops `surface`.
 *
 * Which overlay opens on a given page is not fully deterministic. "The first
 * New/Add/Record button" can differ between runs, a dialog can be slow enough
 * that the open times out, and a help sheet only overflows on some viewports.
 * Keying the baseline on the exact surface therefore produced false failures --
 * the same rule, on the same route, attributed to a different overlay -- and a
 * gate that reddens CI on flake would just get switched back off, which is how
 * this job ended up `continue-on-error` in the first place.
 *
 * Dropping `surface` keeps every dimension that carries real signal (role,
 * viewport, theme, route) while tolerating that variation. The full surface
 * attribution is still in the report for triage.
 */
function baselineKeyFor(result: {
  pattern: string;
  role: string;
  viewport: string;
  theme: string;
}) {
  return `${result.role}|${result.viewport}|${result.theme}|${result.pattern}`;
}

async function applyTheme(page: Page, theme: ThemeName): Promise<void> {
  const switched = await page.evaluate((next) => {
    const root = document.documentElement;
    const wanted = next === "dark";
    if (root.classList.contains("dark") === wanted) return false;
    root.classList.toggle("dark", wanted);
    return true;
  }, theme);
  // Only a real switch starts the crossfade below. The light pass lands on a
  // page that is already light, so it waits for nothing and scans exactly what
  // it scanned before.
  if (switched) await settleThemeTransition(page);
}

/**
 * Waits out the palette crossfade a theme switch starts.
 *
 * Components carry `transition-all` / `transition-colors`, so flipping the
 * `dark` class does not repaint -- it animates every colour from its light
 * value to its dark one over ~150ms. axe measures the colours that are on
 * screen when it runs, so scanning inside that window measured blends of the
 * two palettes rather than either one: a card mid-flight from white to
 * near-black reads as mid-grey, and every piece of text on it fails against it.
 *
 * That was #657 -- "dark mode fails AA contrast on ~every route" -- and the
 * blends being timing-dependent is why its node counts moved by a factor of
 * four between runs and why one run reported none at all. Waiting for the
 * crossfade to land makes the dark pass measure the dark palette.
 *
 * Only transitions are awaited: a page with a looping or long keyframe
 * animation (the header bell) would otherwise cost the full cap on every dark
 * scan, and those animations do not blend the palette. The cap is a guard for
 * a transition that never finishes.
 */
async function settleThemeTransition(page: Page): Promise<void> {
  await page
    .evaluate(async (cap) => {
      // A transition does not exist until styles are recalculated; the first
      // frame does that, the second lets it register.
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const transitions = document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined));
      await Promise.race([
        Promise.all(transitions),
        new Promise((resolve) => setTimeout(resolve, cap)),
      ]);
    }, THEME_TRANSITION_CAP_MS)
    .catch(() => {});
}

/**
 * Waits out the animation an opened surface is playing.
 *
 * This is #657 in a second place. A sheet or dialog mounts with `animate-in
 * fade-in-0 zoom-in-95` and slides in over 100-350ms, and Playwright's
 * "visible" is true from the first frame -- so axe was measuring text at
 * partial opacity over whatever sits behind it. `text-foreground` (#32134f on
 * white) came back as #9785aa on #f3eff8 and failed at 2.96:1, which is not a
 * colour either palette contains. Like the theme crossfade, the blend depends
 * on when axe happened to run, so the same sheet passed on one route and
 * failed on the next.
 *
 * Infinite animations are excluded: the header bell loops, and waiting for it
 * would spend the cap on every surface without ever settling.
 */
async function settleSurfaceMotion(page: Page): Promise<void> {
  await page
    .evaluate(async (cap) => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const finite = document.getAnimations().filter((animation) => {
        const timing = animation.effect?.getComputedTiming();
        return timing !== undefined && timing.iterations !== Infinity;
      });
      await Promise.race([
        Promise.all(finite.map((a) => a.finished.catch(() => undefined))),
        new Promise((resolve) => setTimeout(resolve, cap)),
      ]);
    }, SURFACE_MOTION_CAP_MS)
    .catch(() => {});
}

/**
 * Runs axe, returning null instead of throwing.
 *
 * Opening a surface can navigate -- a "New …" control that routes to a page
 * rather than opening a dialog, a form that submits -- and axe evaluates in the
 * page context, so the navigation destroys it mid-analysis. That used to abort
 * the entire run at whichever route happened to trip it. One unscannable state
 * should cost that one state, not the other 560.
 */
async function safeAnalyze(page: Page): Promise<Violation[] | string> {
  try {
    return await analyze(page);
  } catch (err) {
    return (err as Error).message;
  }
}

async function analyze(page: Page): Promise<Violation[]> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    tags: v.tags,
    nodes: v.nodes.map((n) => ({
      target: n.target as string[],
      html: n.html,
      failureSummary: n.failureSummary,
    })),
  }));
}

/** Follows a list page to a real id, so dynamic routes track the seed. */
async function resolveDynamicRoute(
  page: Page,
  pattern: string,
): Promise<string | null> {
  const source = DYNAMIC_ROUTE_SOURCES[pattern];
  if (!source) return null;

  // A route nothing links to, pinned to a literal seed id instead (#665).
  //
  // Following a link proves the record exists; a hard-coded id proves nothing,
  // so confirm the record renders before handing the path back. A pin that
  // stopped resolving -- the seed edited, the event flipped to private, the row
  // purged by an earlier run -- would otherwise scan Next's not-found page,
  // find nothing wrong with it, and bank a clean baseline entry for a route
  // that was never reached.
  //
  // The check is the heading rather than the status: notFound() streams, so the
  // response is committed 200 before it runs and page.goto() reports 200 for a
  // missing record. Returning null reports the route skipped, which is the
  // honest signal and the one it already had.
  if ("path" in source) {
    try {
      await page.goto(new URL(source.path, baseURL).toString(), {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page
        .getByRole("heading", { name: source.expectHeading })
        .first()
        .waitFor({ state: "attached", timeout: 15_000 });
      return source.path;
    } catch {
      return null;
    }
  }

  try {
    await page.goto(new URL(source.listPath, baseURL).toString(), {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((anchors) =>
        anchors.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""),
      );
    const match = hrefs
      .map((href) => href.split("?")[0])
      .find((href) => source.linkPattern.test(href));
    return match ?? null;
  } catch {
    return null;
  }
}

async function scanRoute(
  page: Page,
  route: string,
  pattern: string,
  role: string,
): Promise<void> {
  for (const pass of MATRIX) {
    // Navigate afresh for every pass rather than reusing the loaded page. An
    // earlier pass opens sheets, dialogs and selects, and a surface that fails
    // to close leaks that state into the next pass's "initial" scan -- which
    // showed up as phantom listbox and focus-guard violations attributed to
    // routes on initial render. A reload is the only way to be sure "initial"
    // means initial.
    try {
      await page.setViewportSize(VIEWPORTS[pass.viewport]);
      await page.goto(new URL(route, baseURL).toString(), {
        waitUntil: "networkidle",
        timeout: 30_000,
      });
    } catch (err) {
      results.push({
        key: keyFor({ pattern, role, ...pass, surface: "initial" }),
        route,
        pattern,
        role,
        viewport: pass.viewport,
        theme: pass.theme,
        surface: "initial",
        error: (err as Error).message,
        violations: [],
      });
      continue;
    }
    // A portal route that lands on the sign-in form means the session went away.
    // Scanning that page and filing it under the requested route would quietly
    // corrupt the baseline, so it is recorded as an error instead.
    //
    // /portal/set-password used to be exempt from this, which meant its three
    // anon scans measured the sign-in page and filed the result under
    // /portal/set-password: the same page counted twice under two names. The
    // form itself needs a signed-in user, so as long as auth routes are
    // scanned as anon it is honestly unreachable, and says so.
    if (
      pattern.startsWith("/portal") &&
      !pattern.startsWith("/portal/login") &&
      new URL(page.url()).pathname.startsWith("/portal/login")
    ) {
      results.push({
        key: keyFor({ pattern, role, ...pass, surface: "initial" }),
        route,
        pattern,
        role,
        viewport: pass.viewport,
        theme: pass.theme,
        surface: "initial",
        error: `redirected to /portal/login — session lost for role ${role}`,
        violations: [],
      });
      continue;
    }

    await applyTheme(page, pass.theme);
    // Mount animations blend colours exactly the way an opening sheet does.
    await settleSurfaceMotion(page);

    const initial = await safeAnalyze(page);
    results.push({
      key: keyFor({ pattern, role, ...pass, surface: "initial" }),
      route,
      pattern,
      role,
      viewport: pass.viewport,
      theme: pass.theme,
      surface: "initial",
      ...(typeof initial === "string"
        ? { error: initial, violations: [] }
        : { violations: initial }),
    });

    // Transient UI, on the light desktop pass plus mobile (where the nav
    // becomes a sheet). Opening every surface in every theme would triple the
    // slowest part of the run for very little extra signal.
    const scanSurfaces =
      pass.theme === "light" &&
      (pass.viewport === "desktop" || pass.viewport === "mobile");
    if (!scanSurfaces) continue;

    for (const surface of surfacesFor(route)) {
      if (pass.viewport === "mobile" && surface.name !== "mobile-nav") continue;
      if (pass.viewport === "desktop" && surface.name === "mobile-nav")
        continue;

      let opened = false;
      try {
        opened = await surface.open(page);
      } catch {
        opened = false;
      }
      if (!opened) continue;

      // If opening it navigated, there is nothing meaningful to attribute to
      // this surface -- go back and move on.
      if (new URL(page.url()).pathname !== new URL(route, baseURL).pathname) {
        await page
          .goto(new URL(route, baseURL).toString(), {
            waitUntil: "networkidle",
            timeout: 30_000,
          })
          .catch(() => {});
        continue;
      }

      // Park the pointer unless the surface is about hover. Clicking a
      // control leaves the mouse on it, and the help button's own tooltip
      // opened by itself during the help-sheet scan and was measured
      // mid-animation -- #657's blend, from a third direction.
      if (surface.name !== "tooltip") await page.mouse.move(0, 0);
      await settleSurfaceMotion(page);

      const opened_result = await safeAnalyze(page);
      results.push({
        key: keyFor({ pattern, role, ...pass, surface: surface.name }),
        route,
        pattern,
        role,
        viewport: pass.viewport,
        theme: pass.theme,
        surface: surface.name,
        ...(typeof opened_result === "string"
          ? { error: opened_result, violations: [] }
          : { violations: opened_result }),
      });

      await surface.close(page).catch(() => {});

      // A surface that fails to close leaks into the next one, and the next
      // one gets the blame: that bug produced two entirely phantom rules
      // before it was caught. Escape is not trusted -- the DOM is checked --
      // and a surface that submits or changes the view says so itself.
      const leaked = await page
        .locator(OVERLAY_SELECTOR)
        .count()
        .catch(() => 0);
      if (leaked > 0 || surface.mutates) {
        await page
          .goto(new URL(route, baseURL).toString(), {
            waitUntil: "networkidle",
            timeout: 30_000,
          })
          .catch(() => {});
      }
    }
  }
}

async function signIn(page: Page, email: string): Promise<boolean> {
  try {
    await page.goto(new URL("/portal/login", baseURL).toString(), {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(SEEDED_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    // noaccess/former land somewhere other than /portal/home by design, so this
    // waits for "any portal page that isn't an auth page" rather than
    // /portal/home. Matching a bare /portal/ would be satisfied by
    // /portal/login itself, which let sign-in report success while the form was
    // still on screen -- every route scanned before the session landed was then
    // silently a scan of the login page.
    await page.waitForURL(
      (url) =>
        url.pathname.startsWith("/portal") &&
        !url.pathname.startsWith("/portal/login") &&
        !url.pathname.startsWith("/portal/set-password"),
      { timeout: 30_000 },
    );
    return true;
  } catch {
    return false;
  }
}

async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
  return context.newPage();
}

/**
 * One unit of scanning work: a set of routes, viewed as one account.
 *
 * Every shard gets its own context, its own page and its own sign-in, which is
 * what makes them safe to run beside each other -- the role sweeps already
 * worked this way, so sharding the anon and admin sweeps is the same shape
 * applied to the two loops that carried the bulk of the run.
 */
type ShardRoute = { pattern: string; isDynamic: boolean };

type Shard = {
  /** The role name recorded in every result key this shard produces. */
  label: string;
  /** null scans signed out. */
  email: string | null;
  /** A shard that cannot sign in fails the run rather than quietly vanishing. */
  required: boolean;
  routes: ShardRoute[];
};

/**
 * Splits routes round-robin rather than into contiguous blocks.
 *
 * Route cost varies by an order of magnitude -- a portal list page with a
 * dozen surfaces against a static public page -- and the expensive ones are
 * clustered by path, so contiguous slices would hand one worker every heavy
 * route in a section and leave another idle. Round-robin interleaves them.
 *
 * With parts === 1 this returns the input unchanged, so a local run scans in
 * exactly the order it always did.
 */
function shardRoutes<T>(routes: T[], parts: number): T[][] {
  if (parts <= 1) return routes.length > 0 ? [routes] : [];
  const slices: T[][] = Array.from({ length: parts }, () => []);
  routes.forEach((route, index) => slices[index % parts].push(route));
  return slices.filter((slice) => slice.length > 0);
}

/** Runs shards over a fixed pool of workers, each pulling the next one. */
async function runShards(shards: Shard[], workers: number): Promise<void> {
  let next = 0;
  const worker = async () => {
    for (let index = next++; index < shards.length; index = next++) {
      await runShard(shards[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(workers, shards.length) }, worker),
  );
}

async function runShard(shard: Shard): Promise<void> {
  const page = await freshPage(browser);
  try {
    if (shard.email && !(await signIn(page, shard.email))) {
      if (shard.required) {
        throw new Error(`Could not sign in as ${shard.email}`);
      }
      skipped.push({
        pattern: `role:${shard.label}`,
        reason: `could not sign in as ${shard.email}`,
      });
      return;
    }
    console.log(`Scanning ${shard.routes.length} routes as ${shard.label}…`);
    for (const route of shard.routes) {
      const concrete = route.isDynamic
        ? await resolveDynamicRoute(page, route.pattern)
        : route.pattern;
      if (!concrete) {
        skipped.push({
          pattern: route.pattern,
          reason: "no seeded record to resolve this dynamic route",
        });
        process.stdout.write("s");
        continue;
      }
      await scanRoute(page, concrete, route.pattern, shard.label);
      process.stdout.write(".");
    }
  } finally {
    await page.context().close();
  }
}

const routes = discoverRoutes();
for (const [pattern, reason] of Object.entries(SKIPPED_ROUTES)) {
  skipped.push({ pattern, reason });
}

const anonRoutes: ShardRoute[] = routes
  .filter((r: DiscoveredRoute) => r.kind === "public" || r.kind === "auth")
  .map((r: DiscoveredRoute) => ({
    pattern: r.pattern,
    isDynamic: r.isDynamic,
  }));
const portalRoutes: ShardRoute[] = routes
  .filter((r: DiscoveredRoute) => r.kind === "portal")
  .map((r: DiscoveredRoute) => ({
    pattern: r.pattern,
    isDynamic: r.isDynamic,
  }));

const shards: Shard[] = [
  ...shardRoutes(anonRoutes, A11Y_WORKERS).map((slice) => ({
    label: "anon",
    email: null,
    required: true,
    routes: slice,
  })),
  ...shardRoutes(portalRoutes, A11Y_WORKERS).map((slice) => ({
    label: "admin",
    email: "admin@example.test",
    required: true,
    routes: slice,
  })),
  // Each role sweep is already one context per role, so it is a shard as it
  // stands. QUICK drops them, as it always did.
  ...(QUICK
    ? []
    : ROLE_SWEEPS.map((sweep) => ({
        label: sweep.label,
        email: sweep.email,
        required: false,
        routes: sweep.routes.map((pattern) => ({ pattern, isDynamic: false })),
      }))),
];

const browser = await chromium.launch({ headless: true });
try {
  console.log(
    `Scanning ${routes.length} routes across ${shards.length} shards ` +
      `on ${A11Y_WORKERS} worker(s)…`,
  );
  await runShards(shards, A11Y_WORKERS);
  console.log();

  // ---- Determinism ---------------------------------------------------------
  //
  // Shards finish in whatever order they finish, so results arrive unordered
  // and the report and baseline would differ byte for byte between two
  // identical runs -- which would make `--check`'s diff meaningless. Sorting on
  // the key each result already carries fixes the order for good, and the
  // baseline below is built by walking this sorted list, so its own key order
  // is fixed too.
  results.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  skipped.sort((a, b) =>
    a.pattern === b.pattern
      ? a.reason < b.reason
        ? -1
        : a.reason > b.reason
          ? 1
          : 0
      : a.pattern < b.pattern
        ? -1
        : 1,
  );

  // Two shards emitting the same key means the same route/role/viewport/theme/
  // surface was scanned twice and one result silently overwrote the other in
  // the baseline. That can only come from a sharding bug, and it would be
  // invisible in the report, so it fails the run rather than being logged.
  const duplicateKeys = new Set<string>();
  const seenKeys = new Set<string>();
  for (const result of results) {
    if (seenKeys.has(result.key)) duplicateKeys.add(result.key);
    seenKeys.add(result.key);
  }
  if (duplicateKeys.size > 0) {
    console.error(
      `\n${duplicateKeys.size} scan keys were produced more than once:`,
    );
    for (const key of [...duplicateKeys].sort()) console.error(`  ✗ ${key}`);
    process.exitCode = 1;
  }

  // ---- Report --------------------------------------------------------------
  const outPath = join(import.meta.dirname, "a11y-report.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), skipped, results },
      null,
      2,
    ),
  );

  const withViolations = results.filter((r) => r.violations.length > 0);
  const withErrors = results.filter((r) => r.error);

  console.log(`\nDone. Report written to ${outPath}`);
  console.log(
    `${results.length} scans across ${routes.length} routes; ` +
      `${withViolations.length} with violations, ${withErrors.length} errored, ` +
      `${skipped.length} skipped.`,
  );

  // Grouped by rule, because a violation in a shared primitive shows up on
  // dozens of routes and a per-route list buries that.
  const byRule = new Map<string, { nodes: number; keys: Set<string> }>();
  for (const result of withViolations) {
    for (const violation of result.violations) {
      const entry = byRule.get(violation.id) ?? { nodes: 0, keys: new Set() };
      entry.nodes += violation.nodes.length;
      entry.keys.add(result.key);
      byRule.set(violation.id, entry);
    }
  }
  if (byRule.size > 0) {
    console.log("\nViolations by rule:");
    for (const [rule, entry] of [...byRule].sort(
      (a, b) => b[1].nodes - a[1].nodes,
    )) {
      console.log(
        `  ${rule}: ${entry.nodes} nodes across ${entry.keys.size} scans`,
      );
    }
  }
  if (skipped.length > 0) {
    console.log("\nSkipped:");
    for (const s of skipped) console.log(`  ${s.pattern} — ${s.reason}`);
  }

  // ---- Baseline ------------------------------------------------------------
  const baselinePath = join(import.meta.dirname, "a11y-baseline.json");
  const currentBaseline: Record<string, string[]> = {};
  // Every key this run actually looked at, so a pass that wasn't run (--quick,
  // a role that couldn't sign in) is not mistaken for a fixed violation.
  const scannedKeys = new Set(results.map(baselineKeyFor));
  for (const result of withViolations) {
    const key = baselineKeyFor(result);
    const rules = new Set(currentBaseline[key] ?? []);
    for (const violation of result.violations) rules.add(violation.id);
    currentBaseline[key] = [...rules].sort();
  }

  if (UPDATE_BASELINE) {
    writeFileSync(
      baselinePath,
      JSON.stringify(currentBaseline, null, 2) + "\n",
    );
    console.log(
      `\nBaseline updated: ${Object.keys(currentBaseline).length} scans with known violations.`,
    );
  } else if (CHECK) {
    const baseline: Record<string, string[]> = existsSync(baselinePath)
      ? JSON.parse(readFileSync(baselinePath, "utf8"))
      : {};

    const regressions: string[] = [];
    for (const [key, rules] of Object.entries(currentBaseline)) {
      const known = new Set(baseline[key] ?? []);
      for (const rule of rules) {
        if (!known.has(rule)) regressions.push(`${key} :: ${rule}`);
      }
    }

    const fixed: string[] = [];
    for (const [key, rules] of Object.entries(baseline)) {
      if (!scannedKeys.has(key)) continue;
      const now = new Set(currentBaseline[key] ?? []);
      for (const rule of rules) {
        if (!now.has(rule)) fixed.push(`${key} :: ${rule}`);
      }
    }

    if (fixed.length > 0) {
      console.log(`\n${fixed.length} baselined violations no longer fire:`);
      for (const f of fixed) console.log(`  ✓ ${f}`);
      console.log(
        "  Run `bun run a11y:baseline` to lock these in so they can't come back.",
      );
    }

    if (regressions.length > 0) {
      console.error(`\n${regressions.length} NEW violations, not in baseline:`);
      for (const r of regressions) console.error(`  ✗ ${r}`);
      process.exitCode = 1;
    } else {
      console.log("\nNo new violations against the baseline.");
    }
  }
} finally {
  await browser.close();
}
