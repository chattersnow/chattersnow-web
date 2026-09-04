// Transient-UI surfaces for the a11y scan (issue #477, section 1).
//
// Base UI unmounts closed overlays and inactive tab panels, and axe skips
// display:none, so none of this is in the DOM when a route is scanned on
// initial render. That is the biggest hole in the scan: 54 files use Sheet,
// 30 use Dialog, 126 call sites render a destructive Alert only after a failed
// submit. #436's finding was an inactive TabsTrigger -- caught only because the
// trigger itself was visible. The panel behind it still has never been scanned.
//
// A surface opens something, lets the scan run, and closes it again. Opening is
// allowed to find nothing (a role may not see the button, a list may be empty);
// `applies` reports that so the run can distinguish "scanned, clean" from
// "never opened", which is the distinction this whole ticket exists to make.
import type { Page } from "@playwright/test";

export type Surface = {
  name: string;
  /** Routes this applies to: a prefix, a pattern, or "*" for every route. */
  routes: "*" | string[];
  /** Returns false when the surface isn't present for this page/role. */
  open: (page: Page) => Promise<boolean>;
  close: (page: Page) => Promise<void>;
};

const modal = (page: Page) =>
  page.getByRole("dialog").and(page.locator(':not([data-slot="toast"])'));

async function pressEscape(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page
    .waitForFunction(
      () => !document.querySelector('[role="dialog"]:not([data-slot="toast"])'),
      undefined,
      { timeout: 2_000 },
    )
    .catch(() => {});
}

/** Clicks a control if it's there, and reports whether it was. */
async function clickIfPresent(
  page: Page,
  selector: () => ReturnType<Page["getByRole"]>,
  waitFor?: () => Promise<void>,
): Promise<boolean> {
  const control = selector().first();
  if ((await control.count()) === 0) return false;
  if (!(await control.isVisible().catch(() => false))) return false;
  await control.click({ timeout: 5_000 }).catch(() => {});
  if (waitFor) await waitFor().catch(() => {});
  return true;
}

export const SURFACES: Surface[] = [
  {
    // Every portal page carries one, and its body has never been scanned:
    // app-muted on leading-relaxed small text, exactly the contrast shape that
    // #290 and #436 kept finding elsewhere.
    name: "help-sheet",
    routes: ["/portal"],
    open: (page) =>
      clickIfPresent(
        page,
        () => page.getByRole("button", { name: "Help for this page" }),
        () => modal(page).first().waitFor({ state: "visible", timeout: 5_000 }),
      ),
    close: pressEscape,
  },
  {
    // The sidebar becomes a sheet at mobile widths, so on a phone this is the
    // only way to navigate the portal at all.
    name: "mobile-nav",
    routes: ["/portal"],
    open: (page) =>
      clickIfPresent(
        page,
        () => page.getByRole("button", { name: /toggle sidebar/i }),
        () => page.waitForTimeout(300),
      ),
    close: pressEscape,
  },
  {
    name: "notifications-menu",
    routes: ["/portal"],
    open: (page) =>
      clickIfPresent(
        page,
        () => page.getByRole("button", { name: /notification/i }),
        () => page.waitForTimeout(300),
      ),
    close: pressEscape,
  },
  {
    // The first "New/Add/Record/Log" dialog on the page. Generic on purpose:
    // naming each of the 30 Dialog call sites would drift the same way the
    // route list did.
    name: "primary-dialog",
    routes: ["/portal"],
    open: (page) =>
      clickIfPresent(
        page,
        () =>
          page.getByRole("button", {
            name: /^(new|add|record|log|create|invite)\b/i,
          }),
        () => modal(page).first().waitFor({ state: "visible", timeout: 5_000 }),
      ),
    close: pressEscape,
  },
  {
    // Select content is portalled and unmounted when closed, so SelectItem
    // hover/selected states have never been measured.
    name: "select-open",
    routes: "*",
    open: async (page) => {
      const trigger = page.getByRole("combobox").first();
      if ((await trigger.count()) === 0) return false;
      if (!(await trigger.isVisible().catch(() => false))) return false;
      await trigger.click({ timeout: 5_000 }).catch(() => {});
      await page
        .getByRole("listbox")
        .first()
        .waitFor({ state: "visible", timeout: 3_000 })
        .catch(() => {});
      return true;
    },
    close: pressEscape,
  },
  {
    // The error state of a form -- Alert variant="destructive" on a white Card.
    // Submitting the sign-in form with bad credentials is the cheapest way to
    // render one, and it happens to be on the highest-traffic page in the app.
    name: "form-error",
    routes: ["/portal/login"],
    open: async (page) => {
      const email = page.getByLabel("Email");
      if ((await email.count()) === 0) return false;
      await email.fill("nobody@example.test");
      await page.getByLabel("Password").fill("wrong-password");
      await page
        .getByRole("button", { name: "Sign in", exact: true })
        .click({ timeout: 5_000 });
      await page
        .getByRole("alert")
        .first()
        .waitFor({ state: "visible", timeout: 10_000 })
        .catch(() => {});
      return true;
    },
    close: async () => {},
  },
  {
    // Inactive tab panels. #436 found a violation on a TabsTrigger here; the
    // panel behind it has still never been rendered for the scan.
    name: "second-tab-panel",
    routes: ["/portal/administration/system-settings", "/portal/events/"],
    open: async (page) => {
      const tabs = page.getByRole("tab");
      const count = await tabs.count();
      if (count < 2) return false;
      await tabs
        .nth(1)
        .click({ timeout: 5_000 })
        .catch(() => {});
      await page.waitForTimeout(400);
      return true;
    },
    close: async () => {},
  },
];

export function surfacesFor(route: string): Surface[] {
  return SURFACES.filter(
    (surface) =>
      surface.routes === "*" ||
      surface.routes.some((prefix) => route.startsWith(prefix)),
  );
}
