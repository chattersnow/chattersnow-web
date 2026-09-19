import { test, expect } from "./helpers/test";
import { signIn } from "./helpers/auth";

const SECTIONS = [
  { path: "/portal/administration", heading: "Users" },
  { path: "/portal/calendar", heading: "Calendar" },
  { path: "/portal/communications", heading: "Messages" },
  { path: "/portal/events", heading: "Events" },
  { path: "/portal/finance", heading: "Expenses" },
  { path: "/portal/governance", heading: "Board Members" },
  { path: "/portal/inventory", heading: "Inventory" },
  { path: "/portal/people", heading: "People" },
  // Three of the eight segments of the People directory (#957). They were
  // top-level routes until then; /portal/organizations and /portal/partners
  // still resolve, as redirects to these.
  { path: "/portal/people/organizations", heading: "Organizations" },
  { path: "/portal/people/partners", heading: "Partners" },
  { path: "/portal/people/volunteers", heading: "Volunteers" },
  { path: "/portal/programs", heading: "Programs" },
  { path: "/portal/volunteers", heading: "Roles" },
];

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

for (const { path, heading } of SECTIONS) {
  test(`${path} loads and shows "${heading}"`, async ({ page }) => {
    await page.goto(path);
    // Well past the 5s default. Each of these is the run's first visit to
    // its route, and the suite runs against `next dev` -- so whichever test
    // gets there first waits for the route to be compiled on demand before
    // anything renders. That is also why a retry of one of these passes:
    // by then the route is warm, not because anything was flaky.
    await expect(
      page.getByRole("heading", { level: 1, name: heading, exact: true }),
    ).toBeVisible({ timeout: 30_000 });
  });
}

test("sidebar navigation shows a skeleton, not a blocking overlay", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "sidebar links are behind the mobile menu");

  await page.goto("/portal/events");
  await expect(
    page.getByRole("heading", { level: 1, name: "Events", exact: true }),
  ).toBeVisible();

  // Slow the destination's RSC fetch down so the loading boundary is observable.
  await page.route("**/portal/people**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  // Watch for the skeleton rather than polling for it (#1288).
  //
  // `expect(...).toBeVisible()` samples; the skeleton is a state the page
  // passes through. The delay above does not widen that window the way it
  // looks like it does -- the boundary is flushed at the head of the streamed
  // RSC response, so what is being delayed is when the window *starts*, not
  // how long it lasts. Its length is a server-side streaming gap, and on a
  // loaded runner it closes between two samples: 1 failure in 10 here under
  // four parallel workers, which is the `element(s) not found` that failed CI.
  //
  // Holding the request open instead is worse, and measuring it says why: hold
  // the navigation and the skeleton never arrives at all, because it arrives
  // *in* that response (9 failures in 20). Hold the prefetches too and it is
  // 5 in 20. So the window cannot be widened from out here -- but a
  // MutationObserver cannot miss it however brief it is.
  await page.evaluate(() => {
    const w = window as unknown as { __sawSkeleton?: boolean };
    w.__sawSkeleton = false;
    const seen = () => {
      if (!document.querySelector('[data-slot="skeleton"]')) return false;
      w.__sawSkeleton = true;
      observer.disconnect();
      return true;
    };
    const observer = new MutationObserver(seen);
    if (!seen()) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });

  // People is one entry with no disclosure since #957 -- its segments are a
  // strip on the page rather than sub-links here -- so the sidebar renders a
  // plain link, the shape Events and Dashboard already have.
  await page
    .getByRole("navigation", { name: "Sidebar" })
    .getByRole("link", { name: "People", exact: true })
    .click();

  // The sidebar must stay visible and interactive while the route loads.
  await expect(page.getByRole("link", { name: "Events" })).toBeVisible();

  await expect(
    page.getByRole("heading", { level: 1, name: "People", exact: true }),
  ).toBeVisible();

  // Asserted after arrival, because the observer above has been recording
  // since before the click: whether a skeleton appeared is a fact by now, not
  // something still to be caught.
  expect(
    await page.evaluate(
      () => (window as unknown as { __sawSkeleton?: boolean }).__sawSkeleton,
    ),
  ).toBe(true);
});
