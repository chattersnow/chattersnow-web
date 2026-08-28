// Ad hoc screenshot verification against an already-running dev server.
// Usage: bun run verify <path> <output-filename.png>
// Example: bun run verify /portal/home home.png
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [pathArg, fileArg] = process.argv.slice(2);

if (!pathArg || !fileArg) {
  console.error("Usage: bun run verify <path> <output-filename.png>");
  console.error("Example: bun run verify /portal/home home.png");
  process.exit(1);
}

const baseURL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
const url = new URL(pathArg, baseURL).toString();
const screenshotsDir = join(import.meta.dirname, "screenshots");
const outputPath = join(screenshotsDir, fileArg);

mkdirSync(screenshotsDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.screenshot({ path: outputPath, fullPage: true });
  console.log(`Saved screenshot of ${url} to ${outputPath}`);
} finally {
  await browser.close();
}
