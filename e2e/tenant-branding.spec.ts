// Issue #819: a tenant's branding must change the palette without changing the
// theme.
//
// `brandingCss()` emits the tenant's colours into a `<style>` element the
// document carries after the stylesheet. That block and globals.css's `.dark`
// are both specificity (0,1,0), so a bare `:root` won the tie and the light
// palette reached dark pages: `--background` resolved to the tenant's page
// background on a dark page, and dark mode went light. Nothing in the emitted
// CSS is wrong to read -- the string the unit tests assert on was correct
// throughout -- so only a browser resolving the cascade can catch this.
//
// The test is the one the issue names: give the tenant the colours globals.css
// already hardcodes, and every brand token must resolve exactly as it does
// with no branding at all, in both themes.
import { test, expect } from "./helpers/test";
import { createAdminClient } from "./helpers/admin-client";
import type { Page } from "@playwright/test";

/**
 * globals.css's own `:root` palette, as brand settings.
 *
 * The platform's, not Chatter Snow's -- since #795 Phase 3 the stylesheet
 * carries a neutral slate and Chatter Snow carries its purple in its own rows.
 * Keep these in step with `:root` in src/app/globals.css: the whole test is
 * that setting the stylesheet's own colours as tenant branding is a no-op, so
 * the day they drift is the day it stops testing anything.
 */
const PLATFORM_PALETTE: Record<string, unknown> = {
  "brand.primary": "#475569",
  "brand.primary_deep": "#1e293b",
  "brand.primary_soft": "#e2e8f0",
  "brand.background": "#f8fafc",
  "brand.accent_stops": ["#94a3b8", "#475569"],
};

const TOKENS = [
  "--background",
  "--foreground",
  "--purple",
  "--purple-deep",
  "--purple-soft",
  "--line",
  "--rainbow",
] as const;

async function setBranding(rows: Record<string, unknown> | null) {
  const admin = createAdminClient();
  const { data: tenant, error: lookup } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", "chatter-snow")
    .single();
  if (lookup) throw new Error(`Could not find the tenant: ${lookup.message}`);

  const { error: cleared } = await admin
    .from("app_settings")
    .delete()
    .eq("tenant_id", tenant.id)
    .like("key", "brand.%");
  if (cleared) throw new Error(`Could not clear branding: ${cleared.message}`);
  if (!rows) return;

  const { error } = await admin.from("app_settings").insert(
    Object.entries(rows).map(([key, value]) => ({
      tenant_id: tenant.id,
      key,
      value,
    })),
  );
  if (error) throw new Error(`Could not set branding: ${error.message}`);
}

/**
 * Every brand token as the browser resolves it, in one theme. Colours are put
 * through a canvas so that `#c8a8ea`, `rgb(200, 168, 234)` and
 * `oklch(from ... h)` compare as the same colour rather than as three strings.
 */
async function palette(page: Page, theme: "light" | "dark") {
  return page.evaluate(
    ({ tokens, dark }) => {
      document.documentElement.classList.toggle("dark", dark);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      const resolved = getComputedStyle(document.documentElement);
      const out: Record<string, string> = {};
      for (const token of tokens) {
        const value = resolved.getPropertyValue(token).trim();
        if (token.startsWith("--rainbow")) {
          // A gradient is not a colour; compare it as text, with the
          // stylesheet's line breaks normalised away.
          out[token] = value.replace(/\s+/g, " ");
          continue;
        }
        const probe = document.createElement("div");
        probe.style.color = value;
        document.body.appendChild(probe);
        ctx.fillStyle = getComputedStyle(probe).color;
        probe.remove();
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        out[token] = `${r},${g},${b}`;
      }
      document.documentElement.classList.remove("dark");
      return out;
    },
    { tokens: [...TOKENS], dark: theme === "dark" },
  );
}

// Serial: both tests write the same tenant's `brand.*` rows, and under
// fullyParallel Playwright will otherwise run them in two workers against the
// one database, where each sees the other's palette.
test.describe.configure({ mode: "serial" });

/**
 * What the tenant had before this file ran, so it can be given back. Since
 * #795 rollout step 3 that is Chatter Snow's real palette rather than nothing,
 * and clearing it would leave every later run measuring a site the seed no
 * longer describes.
 */
let originalBranding: Record<string, unknown> | null = null;

test.beforeAll(async () => {
  const admin = createAdminClient();
  const { data: tenant, error: lookup } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", "chatter-snow")
    .single();
  if (lookup) throw new Error(`Could not find the tenant: ${lookup.message}`);

  const { data, error } = await admin
    .from("app_settings")
    .select("key, value")
    .eq("tenant_id", tenant.id)
    .like("key", "brand.%");
  if (error) throw new Error(`Could not read branding: ${error.message}`);

  const rows = (data ?? []) as { key: string; value: unknown }[];
  originalBranding = rows.length
    ? Object.fromEntries(rows.map((row) => [row.key, row.value]))
    : null;
});

test.afterAll(async () => {
  await setBranding(originalBranding);
});

test("a tenant's own palette renders the same site in both themes", async ({
  page,
}) => {
  await setBranding(null);
  await page.goto("/home");
  const unbranded = {
    light: await palette(page, "light"),
    dark: await palette(page, "dark"),
  };

  // The dark palette must be the dark palette, not the light one wearing its
  // name -- the specific regression, asserted before the comparison so a
  // failure says which way it went.
  expect(unbranded.dark["--background"]).not.toBe(
    unbranded.light["--background"],
  );

  await setBranding(PLATFORM_PALETTE);
  await page.goto("/home");

  expect(await palette(page, "light")).toEqual(unbranded.light);
  expect(await palette(page, "dark")).toEqual(unbranded.dark);
});

test("a tenant's accent survives dark mode", async ({ page }) => {
  // `--rainbow` is the one brand token globals.css does not restate under
  // `.dark`. With the light block scoped away from dark pages, the dark block
  // has to carry it, or a tenant's accent reverts to the stylesheet's gradient
  // exactly where the tenant cannot see it.
  await setBranding({ "brand.accent_stops": ["#123456", "#654321"] });
  await page.goto("/home");

  for (const theme of ["light", "dark"] as const) {
    expect(
      (await palette(page, theme))["--rainbow"],
      `--rainbow in ${theme}`,
    ).toBe("linear-gradient(90deg, #123456 0%, #654321 100%)");
  }
});
