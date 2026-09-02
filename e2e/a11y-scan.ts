// Automated a11y scan for issue #240: runs axe-core against every public
// and portal route and writes a JSON report. Findings-only tool -- does not
// fix anything. Requires the dev server running and, for portal routes, the
// local Supabase stack seeded with the admin@example.test account.
// Usage: bun run e2e/a11y-scan.ts
import { chromium, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const baseURL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

const PUBLIC_ROUTES = [
  "/",
  "/home",
  "/contact",
  "/privacy",
  "/learn",
  "/learn/getting-started",
  "/get-involved",
  "/get-involved/attend",
  "/get-involved/partner",
  "/get-involved/volunteer",
  "/get-involved/volunteer/status",
  "/about",
  "/about/mission",
  "/about/team",
  "/about/story",
  "/programs",
  "/support",
  "/support/donations",
  "/support/sponsorship",
  "/events",
  "/events/community",
  "/events/455e6317-5855-4e02-9d2a-5e71cb787144",
  "/gears",
  "/gears/donate",
  "/gears/library",
  "/gears/sizing",
];

const PORTAL_ROUTES = [
  "/portal/home",
  "/portal/calendar",
  "/portal/calendar/program-suggestions",
  "/portal/calendar/work-queue",
  "/portal/calendar/templates",
  "/portal/calendar/import",
  "/portal/calendar/reports",
  "/portal/programs",
  "/portal/programs/reports",
  "/portal/inventory",
  "/portal/inventory/donations",
  "/portal/inventory/distribution",
  "/portal/inventory/items",
  "/portal/inventory/reports",
  "/portal/people",
  "/portal/governance",
  "/portal/governance/bylaws",
  "/portal/governance/conflict-of-interest",
  "/portal/governance/policies",
  "/portal/governance/nonprofit-status",
  "/portal/governance/meetings",
  "/portal/governance/board-members",
  "/portal/governance/resolutions",
  "/portal/governance/annual-requirements",
  "/portal/finance",
  "/portal/finance/donations",
  "/portal/finance/expenses",
  "/portal/finance/reimbursements",
  "/portal/finance/revenue",
  "/portal/finance/reports",
  "/portal/volunteers",
  "/portal/volunteers/roles",
  "/portal/volunteers/applications",
  "/portal/volunteers/participation",
  "/portal/administration",
  "/portal/administration/access-management",
  "/portal/administration/roles",
  "/portal/administration/audit-log",
  "/portal/administration/permissions",
  "/portal/administration/system-settings",
  "/portal/administration/users",
  "/portal/events",
  "/portal/communications",
];

type RouteResult = {
  route: string;
  error?: string;
  violations: {
    id: string;
    impact: string | null | undefined;
    description: string;
    help: string;
    helpUrl: string;
    tags: string[];
    nodes: { target: string[]; html: string; failureSummary?: string }[];
  }[];
};

async function scanRoute(page: Page, route: string): Promise<RouteResult> {
  try {
    await page.goto(new URL(route, baseURL).toString(), {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    return {
      route,
      violations: results.violations.map((v) => ({
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
      })),
    };
  } catch (err) {
    return { route, error: (err as Error).message, violations: [] };
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`Scanning ${PUBLIC_ROUTES.length} public routes...`);
  const publicResults: RouteResult[] = [];
  for (const route of PUBLIC_ROUTES) {
    publicResults.push(await scanRoute(page, route));
    process.stdout.write(".");
  }
  console.log();

  console.log("Signing in as admin@example.test for portal scan...");
  await page.goto(new URL("/portal/login", baseURL).toString());
  await page.getByLabel("Email").fill("admin@example.test");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/portal\/home$/, { timeout: 30_000 });

  console.log(`Scanning ${PORTAL_ROUTES.length} portal routes...`);
  const portalResults: RouteResult[] = [];
  for (const route of PORTAL_ROUTES) {
    portalResults.push(await scanRoute(page, route));
    process.stdout.write(".");
  }
  console.log();

  const report = {
    generatedAt: new Date().toISOString(),
    publicResults,
    portalResults,
  };
  const outPath = join(import.meta.dirname, "a11y-report.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  const total = [...publicResults, ...portalResults];
  const withViolations = total.filter((r) => r.violations.length > 0);
  const withErrors = total.filter((r) => r.error);
  console.log(`\nDone. Report written to ${outPath}`);
  console.log(
    `${withViolations.length}/${total.length} routes have violations, ${withErrors.length} routes errored.`,
  );
  for (const r of withViolations) {
    console.log(`\n${r.route}:`);
    for (const v of r.violations) {
      console.log(
        `  [${v.impact}] ${v.id} (${v.nodes.length} nodes) -- ${v.help}`,
      );
    }
  }
} finally {
  await browser.close();
}
