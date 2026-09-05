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
 * Playwright runs a dependency project in full, ignoring any file or --grep
 * filter, so run one of these on its own with --no-deps:
 *   bunx playwright test e2e/page-visibility.spec.ts --no-deps
 * Filters that don't select this project don't pull the browsers in at all.
 */
const MUTATING_SPECS = /page-visibility\.spec\.ts/;

const ALL_BROWSER_PROJECTS = [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  { name: "webkit", use: { ...devices["Desktop Safari"] } },
  { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
];

/**
 * Narrow the browser matrix with E2E_BROWSERS rather than `--project`, so the
 * page-visibility project's dependency edge still covers exactly the projects
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

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // Locally, Playwright's default worker count (half the machine's cores)
  // floods the shared dev-mode Next server + Docker Supabase stack with
  // concurrent sign-ins and on-demand compiles, failing large swaths of the
  // suite on navigation/sign-in timeouts (#479). CI's small runner lands at
  // ~2 workers naturally, which is why the same suite passes there — mirror
  // that locally. CI keeps the default.
  workers: process.env.CI ? undefined : 2,
  reporter: "html",
  use: {
    baseURL,
    headless: true,
    trace: "on-first-retry",
  },
  projects: [
    ...browserProjects.map((project) => ({
      ...project,
      testIgnore: MUTATING_SPECS,
    })),
    {
      // Runs after every browser project, on its own, because it mutates
      // global state -- see MUTATING_SPECS above.
      name: "page-visibility",
      use: { ...devices["Desktop Chrome"] },
      testMatch: MUTATING_SPECS,
      dependencies: browserProjects.map((project) => project.name),
    },
  ],
  webServer: {
    command: "bun run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // On a cold .next/dev cache (first run after a checkout/clean, or when
    // Turbopack's "Slow filesystem detected" path kicks in) the dev server's
    // first response can take well over two minutes, which made local runs
    // die in webServer startup before a single test ran (#479). Pre-warming
    // with a manual `bun run dev` also works (reuseExistingServer is on
    // locally), but the timeout shouldn't be the thing that fails the run.
    timeout: 300_000,
  },
});
