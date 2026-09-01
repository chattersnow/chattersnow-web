import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local" });

const baseURL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

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
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
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
