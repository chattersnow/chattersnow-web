import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local" });

const baseURL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

/**
 * Specs that mutate state the whole site shares, so they cannot run beside
 * anything else. They get a project of their own below, ordered after every
 * browser project by a dependency edge.
 *
 * page-visibility.spec.ts toggles the real `page_visibility.*` row in
 * app_settings to prove the visibility gate works. Playwright's serial mode
 * only orders a describe block within its project, so a parallel worker
 * running support.spec.ts loaded the site while Support was toggled off and
 * failed on the 404 the gate correctly served (#594). Every public section is
 * gated now, so any slot a spec toggles can take out every other spec that
 * touches that section.
 *
 * unresolved-host.spec.ts provisions a second *active* tenant, which is the
 * only way to exercise the host-resolution 404 (#795 Phase 4) -- and doing so
 * switches off the sole-active-tenant fallback that every other spec's public
 * page depends on. For as long as it holds that tenant, the whole public site
 * 404s for everyone.
 *
 * legal-publication.spec.ts puts a legal document in force by writing the real
 * `legal_publication.*` row (#859), which changes the footer for every spec
 * running at the same time and makes /terms answer differently from what
 * legal.spec.ts asserts. It clears the rows again in afterEach, but only
 * serialising it makes that safe.
 *
 * tenant-branding.spec.ts writes `brand.*` rows for the seeded tenant (#819),
 * which repaints the public site for every other spec running at the same
 * time. It gives them back in afterAll, but only serialising it makes that
 * safe.
 *
 * person-role-labels.spec.ts writes the tenant's `people.role_labels` (#911),
 * which renames Donors, Attendees and Staff in the sidebar and on their pages
 * for every spec running at the same time -- and several of those specs find
 * those pages by name. Same shape as tenant-branding above: restored in
 * afterAll, safe only because it is serialised.
 *
 * Playwright runs a dependency project in full, ignoring any file or --grep
 * filter, so run one of these on its own with --no-deps:
 *   bunx playwright test e2e/page-visibility.spec.ts --no-deps
 * Filters that don't select this project don't pull the browsers in at all.
 *
 * That same rule is why E2E_MUTATING exists (see below): --shard is one more
 * filter a dependency project ignores.
 */
const MUTATING_SPECS =
  /(page-visibility|unresolved-host|tenant-branding|legal-publication|module-gating|programs-source|person-role-labels)\.spec\.ts/;

const ALL_BROWSER_PROJECTS = [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  { name: "webkit", use: { ...devices["Desktop Safari"] } },
  { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
];

/**
 * Narrow the browser matrix with E2E_BROWSERS rather than `--project`, so the
 * mutating project's dependency edge still covers exactly the projects
 * that are running. `--project=chromium` would leave that project unselected
 * (nothing depends on it), and naming it as well would drag in the browsers it
 * depends on that the run meant to skip.
 */
const requestedBrowsers = (process.env.E2E_BROWSERS ?? "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

for (const name of requestedBrowsers) {
  if (!ALL_BROWSER_PROJECTS.some((project) => project.name === name)) {
    throw new Error(
      `E2E_BROWSERS names an unknown project "${name}". Known projects: ` +
        ALL_BROWSER_PROJECTS.map((project) => project.name).join(", "),
    );
  }
}

const browserProjects = requestedBrowsers.length
  ? ALL_BROWSER_PROJECTS.filter((project) =>
      requestedBrowsers.includes(project.name),
    )
  : ALL_BROWSER_PROJECTS;

/**
 * Which half of the suite to build, so that CI can shard the browser half
 * across a matrix (#753). Unset -- the local default -- builds both halves and
 * changes nothing.
 *
 *   skip   only the browser projects; the mutating specs are left out entirely
 *   only   only the mutating specs, no dependency edge, alone on their own stack
 *
 * `--shard` splits top-level projects only. Playwright detaches dependency
 * project suites before applying the shard filter and re-adds them in full
 * afterwards, and a project that is both selected *and* depended on counts as a
 * dependency. So with the mutating project in the run, chromium and mobile-chromium
 * are dependency projects, and `--shard=1/4` gives shard 1 all 354 tests and
 * shards 2-4 none of them. The two halves therefore have to be separate
 * processes, which on CI means separate jobs -- and separate jobs mean separate
 * Supabase stacks and servers, which isolates the mutating specs more thoroughly
 * than the dependency edge ever did.
 */
const mutatingMode = process.env.E2E_MUTATING?.trim() ?? "";

if (mutatingMode && mutatingMode !== "skip" && mutatingMode !== "only") {
  throw new Error(
    `E2E_MUTATING must be "skip", "only" or unset, not "${mutatingMode}".`,
  );
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Double Playwright's 30s default. This was set when the suite ran against
  // `next dev` and the first test to reach a route paid for compiling it; the
  // server is a production build now (#744), so that cost is gone, but the
  // headroom still covers a slow runner under parallel load. Genuinely long
  // tests still opt in with `test.slow()`.
  timeout: 60_000,
  // Locally, Playwright's default worker count (half the machine's cores)
  // floods the shared Next server + Docker Supabase stack with concurrent
  // sign-ins, failing large swaths of the suite on navigation/sign-in timeouts
  // (#479). CI's small runner lands at ~2 workers naturally, which is why the
  // same suite passes there — mirror that locally. CI keeps the default.
  workers: process.env.CI ? undefined : 2,
  // Two projects and 354 tests share one dev server and one Supabase
  // instance on a small runner, and they seed each other's lists while they
  // run. That leaves a handful of tests per run -- most of them on the
  // mobile project -- that fail once and pass untouched on the next run,
  // and the set is different every time.
  //
  // A retry that passes is reported as `flaky` rather than green, so the
  // report still names every one of them and a test that starts flaking
  // regularly is still visible. What it must not become is a way to let a
  // genuinely broken test through: a failure that reproduces on all three
  // attempts is a real one, and the trace from the first retry (already
  // configured below) is there to diagnose it.
  retries: process.env.CI ? 2 : 0,
  expect: {
    // Playwright's default is 5s, which is a fine budget for a page that is
    // already on screen and a poor one for anything that has to make a round
    // trip first. Every write in the portal is a Server Action followed by
    // `router.refresh()`, so the assertion that the save landed -- a sheet
    // closing, a list picking up the new row, a phase badge clearing -- is
    // waiting on the server to re-render the page and on Supabase to answer.
    // Under CI load that crosses 5s often enough that a handful of write tests
    // failed or went flaky every run, always on the assertion right after a
    // save and never on what it asserted.
    //
    // The per-action budget above stays at 15s for the same reason, and the
    // 60s test timeout still bounds a test that is genuinely stuck.
    timeout: 15_000,
  },
  reporter: "html",
  use: {
    baseURL,
    headless: true,
    trace: "on-first-retry",
    // Playwright's default is no per-action timeout, so a click on an element
    // that never becomes actionable retries silently until the whole test
    // times out -- reported as a bare "Test timeout exceeded" naming nothing.
    // Capped so that failure names the element instead.
    actionTimeout: 15_000,
  },
  projects: [
    ...(mutatingMode === "only"
      ? []
      : browserProjects.map((project) => ({
          ...project,
          testIgnore: MUTATING_SPECS,
        }))),
    ...(mutatingMode === "skip"
      ? []
      : [
          {
            // Runs after every browser project, on its own, because it mutates
            // global state -- see MUTATING_SPECS above. Under E2E_MUTATING=only
            // it is the whole run, so there is nothing to order it after and
            // the dependency edge would only drag the browsers back in.
            name: "mutating",
            use: { ...devices["Desktop Chrome"] },
            testMatch: MUTATING_SPECS,
            dependencies:
              mutatingMode === "only"
                ? []
                : browserProjects.map((project) => project.name),
          },
        ]),
  ],
  webServer: {
    // Build once, then serve, rather than `bun run dev` (#744). Under the dev
    // server, whichever test was first to reach a route paid to compile it out
    // of its own assertion budget, and which test that was changed every run --
    // the single largest source of churn in the suite. It also spat
    // "destination stream closed early" / ECONNRESET into every CI log under
    // parallel load. A production build is the more honest target anyway: it is
    // what ships. The cost is ~35s of `next build` against a job that runs for
    // 20+ minutes.
    //
    // What this gives up: React dev warnings, the dev error overlay and
    // dev-mode RSC behaviour are no longer exercised here -- the unit and
    // integration suites still run against dev semantics. Two specs already
    // account for the `<nextjs-portal>` dev overlay being absent
    // (skip-link.spec.ts, portal-finance-reports.spec.ts).
    command: "bun run build && bun run start",
    url: baseURL,
    // Local runs still attach to a `bun run dev` a developer already has open,
    // so nothing about the local loop changes.
    reuseExistingServer: !process.env.CI,
    // Generous because this now covers a full build before the first response.
    timeout: 300_000,
  },
});
